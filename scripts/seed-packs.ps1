# Popula a biblioteca local de packs de som que o sounds.ps1 lê.
#
# Origem: a pasta já processada em resync-web (os .rpf extraídos dos .rar/.zip
# originais, com sha256 conferido no manifest.json).
# Destino: %LOCALAPPDATA%\PLFCore\packs\<id>\ com RESIDENT.rpf,
# WEAPONS_PLAYER.rpf, pack.json e preview.mp4.
#
# Idempotente: pack já completo no destino é pulado. Rode de novo à vontade.

[CmdletBinding()]
param(
  [string]$Origem = 'D:\Github\resync-web\public\packs',
  [string]$Destino = (Join-Path $env:LOCALAPPDATA 'PLFCore\packs'),
  # Confere o sha256 de cada arquivo copiado contra o manifest. Lento (~112 MB
  # por pack), mas é o que garante que um .rpf truncado não trave o jogo.
  [switch]$Conferir
)

$ErrorActionPreference = 'Stop'

$manifestArq = Join-Path $Origem 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestArq)) {
  throw "manifest.json nao encontrado em $Origem"
}

$manifest = Get-Content -LiteralPath $manifestArq -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

$feitos = 0
$pulados = 0
$falhas = 0

foreach ($pack in $manifest.packs) {
  # O id sai do caminho declarado no manifest (som-01/RESIDENT.rpf -> som-01),
  # e não de uma contagem: pack fora de ordem continua indo pra pasta certa.
  $id = ([string]$pack.resident.url).Split('/')[0]
  if ($id -notmatch '^[A-Za-z0-9_-]{1,64}$') {
    Write-Warning "id invalido, pulando: $id"
    $falhas += 1
    continue
  }

  $pastaDestino = Join-Path $Destino $id
  $rpfs = @(
    @{ nome = 'RESIDENT.rpf'; origem = (Join-Path $Origem $pack.resident.url); sha = [string]$pack.resident.sha256 }
    @{ nome = 'WEAPONS_PLAYER.rpf'; origem = (Join-Path $Origem $pack.weapons.url); sha = [string]$pack.weapons.sha256 }
  )

  $completo = $true
  foreach ($r in $rpfs) {
    if (-not (Test-Path -LiteralPath (Join-Path $pastaDestino $r.nome))) { $completo = $false; break }
  }
  if ($completo -and (Test-Path -LiteralPath (Join-Path $pastaDestino 'pack.json'))) {
    Write-Host "[$id] ja existe, pulando"
    $pulados += 1
    continue
  }

  try {
    New-Item -ItemType Directory -Force -Path $pastaDestino | Out-Null

    foreach ($r in $rpfs) {
      if (-not (Test-Path -LiteralPath $r.origem)) { throw "origem ausente: $($r.origem)" }
      $alvo = Join-Path $pastaDestino $r.nome
      Write-Host "[$id] copiando $($r.nome)..."
      Copy-Item -LiteralPath $r.origem -Destination $alvo -Force
      if ($Conferir) {
        $hash = (Get-FileHash -LiteralPath $alvo -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne $r.sha.ToLowerInvariant()) { throw "sha256 nao bate em $($r.nome)" }
      }
    }

    # O vídeo é opcional: sem ele a UI só não mostra o botão de prévia.
    if ($pack.video) {
      $videoOrigem = Join-Path $Origem ([string]$pack.video)
      if (Test-Path -LiteralPath $videoOrigem) {
        Write-Host "[$id] copiando previa..."
        Copy-Item -LiteralPath $videoOrigem -Destination (Join-Path $pastaDestino 'preview.mp4') -Force
      }
    }

    [pscustomobject]@{
      nome = [string]$pack.nome
      sha256 = [pscustomobject]@{
        'RESIDENT.rpf' = [string]$pack.resident.sha256
        'WEAPONS_PLAYER.rpf' = [string]$pack.weapons.sha256
      }
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $pastaDestino 'pack.json') -Encoding UTF8

    Write-Host "[$id] OK"
    $feitos += 1
  } catch {
    Write-Warning "[$id] falhou: $_"
    $falhas += 1
  }
}

Write-Host ""
Write-Host "biblioteca: $Destino"
Write-Host "instalados: $feitos | ja existiam: $pulados | falhas: $falhas"
