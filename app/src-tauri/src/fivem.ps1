$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# FiveM no cliente. O que este script NÃO faz, de propósito:
#   - não toca em citizen/  (é o produto FiveM, tem hash SHA-256 conferido no boot
#     e o updater desfaz qualquer alteração);
#   - não apaga data/game-storage/  (dispara GB de re-download do cache de jogo);
#   - não instala mod nenhum. Com sv_pureLevel 1 o servidor só perdoa 4 caminhos
#     de áudio, com 2 não perdoa nada, e no FiveM para GTA V Enhanced o pure é
#     sempre ligado. Instalar mod aqui é impedir a pessoa de entrar no servidor.

$FmApp = Join-Path $env:LOCALAPPDATA 'FiveM\FiveM.app'
$FmData = Join-Path $FmApp 'data'
$FmPerfil = Join-Path $env:APPDATA 'CitizenFX'
$FmBackup = Join-Path $env:LOCALAPPDATA 'Resync\fivem-backup'

# Caches recriados pelo cliente. O custo pra pessoa é um loading mais lento no
# próximo join, nada além disso.
$FmCaches = @(
  @{ id = 'server-cache'; caminho = (Join-Path $FmData 'server-cache') },
  @{ id = 'server-cache-priv'; caminho = (Join-Path $FmData 'server-cache-priv') },
  @{ id = 'nui-storage'; caminho = (Join-Path $FmData 'nui-storage') },
  @{ id = 'cache'; caminho = (Join-Path $FmData 'cache') },
  @{ id = 'crashes'; caminho = (Join-Path $FmApp 'crashes') },
  @{ id = 'logs'; caminho = (Join-Path $FmApp 'logs') }
)

# Pastas que o pure mode olha. Ter conteúdo aqui é a explicação mais comum pra
# "não consigo entrar naquele servidor".
$FmMods = @(
  @{ id = 'mods'; caminho = (Join-Path $FmApp 'mods') },
  @{ id = 'plugins'; caminho = (Join-Path $FmApp 'plugins') },
  @{ id = 'addons'; caminho = (Join-Path $FmApp 'addons') }
)

function Get-FmBytes([string]$path) {
  try {
    $soma = (Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $soma) { return 0 }
    return [int64]$soma
  } catch { return 0 }
}

function Test-FmFechado {
  if (Get-Process -Name 'FiveM' -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
  if (Get-Process -Name 'FiveM_b*' -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
}

function Get-FmIni {
  $arquivo = Join-Path $FmApp 'CitizenFX.ini'
  $lidos = @{}
  if (-not (Test-Path -LiteralPath $arquivo)) { return $lidos }
  foreach ($linha in @(Get-Content -LiteralPath $arquivo)) {
    $t = ([string]$linha).Trim()
    if ($t.StartsWith('[') -or $t.StartsWith(';') -or $t.Length -eq 0) { continue }
    $igual = $t.IndexOf('=')
    if ($igual -gt 0) { $lidos[$t.Substring(0, $igual).Trim()] = $t.Substring($igual + 1).Trim() }
  }
  return $lidos
}

$acao = $env:RESYNC_FIVEM_ACTION

if ($acao -eq 'scan') {
  $instalado = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'FiveM\FiveM.exe')
  $ini = Get-FmIni

  $caches = foreach ($c in $FmCaches) {
    [pscustomobject]@{
      id = [string]$c.id
      caminho = [string]$c.caminho
      existe = (Test-Path -LiteralPath ([string]$c.caminho))
      bytes = Get-FmBytes ([string]$c.caminho)
    }
  }

  $mods = foreach ($m in $FmMods) {
    $caminho = [string]$m.caminho
    $arquivos = 0
    if (Test-Path -LiteralPath $caminho) {
      $arquivos = @(Get-ChildItem -LiteralPath $caminho -Recurse -File -Force -ErrorAction SilentlyContinue).Count
    }
    [pscustomobject]@{
      id = [string]$m.id
      caminho = $caminho
      arquivos = $arquivos
      bytes = Get-FmBytes $caminho
    }
  }

  $versao = $null
  $arqVersao = Join-Path $FmApp 'citizen\version.txt'
  if (Test-Path -LiteralPath $arqVersao) {
    try { $versao = (Get-Content -LiteralPath $arqVersao -Raw).Trim() } catch {}
  }

  $cfgPerfil = Join-Path $FmPerfil 'fivem.cfg'
  $xmlPerfil = Join-Path $FmPerfil 'gta5_settings.xml'

  [pscustomobject]@{
    instalado = $instalado
    versao = $versao
    canal = if ($ini.ContainsKey('UpdateChannel')) { [string]$ini['UpdateChannel'] } else { $null }
    dumpCompleto = ($ini.ContainsKey('EnableFullMemoryDump') -and [string]$ini['EnableFullMemoryDump'] -eq '1')
    configCliente = if (Test-Path -LiteralPath $cfgPerfil) { $cfgPerfil } else { $null }
    configGraficos = if (Test-Path -LiteralPath $xmlPerfil) { $xmlPerfil } else { $null }
    caches = @($caches)
    mods = @($mods)
    backup = $FmBackup
    origin = 'measured'
  } | ConvertTo-Json -Depth 5 -Compress
  exit 0
}

if ($acao -eq 'clean') {
  Test-FmFechado
  $liberado = 0
  $pastas = 0
  $falhas = 0
  foreach ($c in $FmCaches) {
    $caminho = [string]$c.caminho
    if (-not (Test-Path -LiteralPath $caminho)) { continue }
    $antes = Get-FmBytes $caminho
    try {
      # Esvazia o conteúdo, nunca a pasta: o timestamp de criação de `crashes`
      # é o que o FiveM usa pra decidir onde guardar o gta5_settings.xml.
      Get-ChildItem -LiteralPath $caminho -Force -ErrorAction Stop | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      }
      $liberado += [math]::Max(0, $antes - (Get-FmBytes $caminho))
      $pastas += 1
    } catch {
      $falhas += 1
    }
  }
  [pscustomobject]@{ liberadoBytes = $liberado; pastas = $pastas; falhas = $falhas; origin = 'measured' } |
    ConvertTo-Json -Compress
  exit 0
}

if ($acao -eq 'isolar') {
  # Move mods/plugins/addons pra um backup datado. Move, nunca apaga: é conteúdo
  # que a pessoa escolheu instalar e pode querer de volta em servidor pure 0.
  Test-FmFechado
  $alvo = $env:RESYNC_FIVEM_PASTA
  $escolhidos = @($FmMods | Where-Object { [string]$_.id -eq $alvo })
  if ($escolhidos.Count -eq 0) { throw 'ERR_FIVEM_FOLDER' }

  $origem = [string]$escolhidos[0].caminho
  if (-not (Test-Path -LiteralPath $origem)) { throw 'ERR_FIVEM_EMPTY' }
  $itens = @(Get-ChildItem -LiteralPath $origem -Force -ErrorAction SilentlyContinue)
  if ($itens.Count -eq 0) { throw 'ERR_FIVEM_EMPTY' }

  $carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
  $destino = Join-Path $FmBackup "$alvo-$carimbo"
  New-Item -ItemType Directory -Force -Path $destino | Out-Null
  $movidos = 0
  $falhas = 0
  foreach ($item in $itens) {
    try {
      Move-Item -LiteralPath $item.FullName -Destination (Join-Path $destino $item.Name) -Force -ErrorAction Stop
      $movidos += 1
    } catch {
      $falhas += 1
    }
  }
  [pscustomobject]@{ pasta = $alvo; movidos = $movidos; falhas = $falhas; destino = $destino; origin = 'measured' } |
    ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_FIVEM_ACTION'
