$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Mod de som do GTA V (pure mode do FiveM). Troca os dois .rpf de áudio em
# x64\audio\sfx pelos de um pack da biblioteca local.
#
# Por que ISSO pode e o fivem.ps1 não pode instalar mod: o sv_pureLevel 1 perdoa
# caminhos de áudio do jogo — RESIDENT.rpf e WEAPONS_PLAYER.rpf estão entre eles.
# O que o pure mode NÃO perdoa é conteúdo em FiveM.app\mods|plugins|addons, que é
# o que o fivem.ps1 isola. São alvos diferentes.
#
# Continua valendo: em servidor com sv_pureLevel 2 nada é perdoado, e a pessoa
# não entra. A UI é obrigada a dizer isso antes de instalar.
#
# Regras invioláveis daqui:
#   1. só escreve com GTA V e FiveM FECHADOS — o jogo tranca os .rpf;
#   2. geração indetectável não instala às cegas (fail-closed);
#   3. a primeira escrita SEMPRE guarda os .rpf atuais no backup — é o caminho
#      de volta pro vanilla e não pode depender do pack;
#   4. só escreve os dois nomes da lista permitida, nunca um caminho que venha
#      de fora;
#   5. confere sha256 do pack antes de copiar: .rpf truncado trava o jogo.

$SndRaiz = Join-Path $env:LOCALAPPDATA 'PLFCore'
$SndBiblioteca = Join-Path $SndRaiz 'packs'
$SndBackup = Join-Path $SndRaiz 'backup\sounds'
$SndEstadoArq = Join-Path $SndRaiz 'sounds-estado.json'

# Os únicos arquivos que este script escreve. Fora desta lista, recusa.
$SndPermitidos = @('RESIDENT.rpf', 'WEAPONS_PLAYER.rpf')

# Processos que seguram os .rpf abertos.
$SndProcessos = @('GTA5', 'GTA5_Enhanced', 'GTA5_BE', 'GTA5_Enhanced_BE', 'FiveM')

function Test-SndFechado {
  foreach ($p in $SndProcessos) {
    if (Get-Process -Name $p -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
  }
  if (Get-Process -Name 'FiveM_b*' -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
}

# Alvo do som. A geração vem do executável, nunca de chute: sem os dois exes
# conhecidos a resposta é $null e toda escrita recusa.
function Get-SndAlvo {
  $exe = Get-Gta5Path
  if (-not $exe) { return $null }
  $raiz = Split-Path -Parent $exe
  $sfx = Join-Path $raiz 'x64\audio\sfx'
  if (-not (Test-Path -LiteralPath (Join-Path $sfx 'WEAPONS_PLAYER.rpf'))) { return $null }
  $geracao = $null
  if (Test-Path -LiteralPath (Join-Path $raiz 'GTA5_Enhanced.exe')) {
    $geracao = 'enhanced'
  } elseif (Test-Path -LiteralPath (Join-Path $raiz 'GTA5.exe')) {
    $geracao = 'legacy'
  }
  return [pscustomobject]@{ raiz = $raiz; sfx = $sfx; geracao = $geracao }
}

function Get-SndId([string]$bruto) {
  $id = [string]$bruto
  if ($id -notmatch '^[A-Za-z0-9_-]{1,64}$') { throw 'ERR_SND_PACK' }
  return $id
}

function Get-SndPastaPack([string]$id) {
  $pasta = Join-Path $SndBiblioteca (Get-SndId $id)
  if (-not (Test-Path -LiteralPath $pasta -PathType Container)) { throw 'ERR_SND_PACK' }
  return $pasta
}

function Get-SndHash([string]$caminho) {
  return (Get-FileHash -LiteralPath $caminho -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-SndEstado {
  if (-not (Test-Path -LiteralPath $SndEstadoArq)) { return $null }
  try { return (Get-Content -LiteralPath $SndEstadoArq -Raw | ConvertFrom-Json) } catch { return $null }
}

# tmp + move no mesmo diretório: estado meio escrito nunca fica no lugar do bom.
function Set-SndEstado($estado) {
  New-Item -ItemType Directory -Force -Path $SndRaiz | Out-Null
  $tmp = "$SndEstadoArq.tmp"
  ($estado | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $SndEstadoArq -Force
}

function Get-SndPacks {
  $achados = New-Object System.Collections.ArrayList
  if (-not (Test-Path -LiteralPath $SndBiblioteca -PathType Container)) { return @() }
  foreach ($dir in @(Get-ChildItem -LiteralPath $SndBiblioteca -Directory -ErrorAction SilentlyContinue)) {
    if ($dir.Name -notmatch '^[A-Za-z0-9_-]{1,64}$') { continue }
    # Pack incompleto não aparece na lista: melhor sumir do que falhar na hora
    # de instalar, com o vanilla já deslocado.
    $completo = $true
    $bytes = 0
    foreach ($arq in $SndPermitidos) {
      $c = Join-Path $dir.FullName $arq
      if (-not (Test-Path -LiteralPath $c -PathType Leaf)) { $completo = $false; break }
      $bytes += (Get-Item -LiteralPath $c).Length
    }
    if (-not $completo) { continue }

    $nome = $dir.Name
    $metaArq = Join-Path $dir.FullName 'pack.json'
    if (Test-Path -LiteralPath $metaArq) {
      try {
        $meta = Get-Content -LiteralPath $metaArq -Raw | ConvertFrom-Json
        if ($meta.nome) { $nome = [string]$meta.nome }
      } catch {}
    }

    [void]$achados.Add([pscustomobject]@{
      id = $dir.Name
      nome = $nome
      bytes = [int64]$bytes
      temPreview = (Test-Path -LiteralPath (Join-Path $dir.FullName 'preview.mp4'))
    })
  }
  return @($achados | Sort-Object -Property id)
}

function Test-SndBackupCompleto {
  foreach ($arq in $SndPermitidos) {
    if (-not (Test-Path -LiteralPath (Join-Path $SndBackup $arq) -PathType Leaf)) { return $false }
  }
  return $true
}

# Guarda o estado ATUAL da máquina. Só roda quando ainda não existe backup: se
# rodasse de novo por cima, o "original" viraria o mod instalado antes.
function Save-SndBackup([string]$sfx) {
  if (Test-SndBackupCompleto) { return $false }
  New-Item -ItemType Directory -Force -Path $SndBackup | Out-Null
  foreach ($arq in $SndPermitidos) {
    $origem = Join-Path $sfx $arq
    if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) { throw 'ERR_SND_COPIA' }
    Copy-Item -LiteralPath $origem -Destination (Join-Path $SndBackup $arq) -Force
  }
  return $true
}

# Copia pro lado e renomeia por cima. O rename é atômico no mesmo volume, então
# o jogo nunca enxerga um .rpf pela metade.
function Copy-SndArquivo([string]$origem, [string]$destino) {
  $tmp = "$destino.plfcore-tmp"
  try {
    Copy-Item -LiteralPath $origem -Destination $tmp -Force
    Move-Item -LiteralPath $tmp -Destination $destino -Force
  } catch {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    throw 'ERR_SND_COPIA'
  }
}

$acao = $env:PLFCORE_SOUNDS_ACTION

if ($acao -eq 'scan') {
  $alvo = Get-SndAlvo
  $packs = Get-SndPacks

  # Só reporta pack instalado se o arquivo que está lá AGORA é o que a gente
  # gravou. Trocou por fora, o app não mente sobre isso.
  $instaladoId = $null
  $estado = Get-SndEstado
  if ($estado -and $estado.instaladoId -and $alvo) {
    $atual = Join-Path $alvo.sfx 'RESIDENT.rpf'
    if (Test-Path -LiteralPath $atual -PathType Leaf) {
      try {
        if ((Get-SndHash $atual) -eq [string]$estado.sha256Resident) {
          $instaladoId = [string]$estado.instaladoId
        }
      } catch {}
    }
  }

  $aberto = $false
  foreach ($p in $SndProcessos) {
    if (Get-Process -Name $p -ErrorAction SilentlyContinue) { $aberto = $true; break }
  }
  if (-not $aberto -and (Get-Process -Name 'FiveM_b*' -ErrorAction SilentlyContinue)) { $aberto = $true }

  [pscustomobject]@{
    gtaRaiz = if ($alvo) { [string]$alvo.raiz } else { $null }
    sfx = if ($alvo) { [string]$alvo.sfx } else { $null }
    geracao = if ($alvo) { $alvo.geracao } else { $null }
    jogoAberto = $aberto
    biblioteca = $SndBiblioteca
    temBackup = Test-SndBackupCompleto
    instaladoId = $instaladoId
    packs = @($packs)
    origin = 'measured'
  } | ConvertTo-Json -Depth 5 -Compress
  exit 0
}

if ($acao -eq 'install') {
  Test-SndFechado
  $alvo = Get-SndAlvo
  if (-not $alvo) { throw 'ERR_SND_SEM_GTA' }
  if (-not $alvo.geracao) { throw 'ERR_SND_GERACAO' }

  $id = Get-SndId $env:PLFCORE_SOUNDS_PACK
  $pasta = Get-SndPastaPack $id

  $esperado = @{}
  $metaArq = Join-Path $pasta 'pack.json'
  if (Test-Path -LiteralPath $metaArq) {
    try {
      $meta = Get-Content -LiteralPath $metaArq -Raw | ConvertFrom-Json
      if ($meta.sha256) {
        foreach ($prop in $meta.sha256.PSObject.Properties) {
          $esperado[[string]$prop.Name] = ([string]$prop.Value).ToLowerInvariant()
        }
      }
    } catch {}
  }

  # Confere tudo ANTES de escrever qualquer coisa: um pack corrompido não pode
  # deixar o jogo com um .rpf bom e outro quebrado.
  $origens = @{}
  foreach ($arq in $SndPermitidos) {
    $origem = Join-Path $pasta $arq
    if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) { throw 'ERR_SND_PACK' }
    if ($esperado.ContainsKey($arq)) {
      if ((Get-SndHash $origem) -ne $esperado[$arq]) { throw 'ERR_SND_HASH' }
    }
    $origens[$arq] = $origem
  }

  $backupCriado = Save-SndBackup $alvo.sfx

  $escritos = 0
  foreach ($arq in $SndPermitidos) {
    Copy-SndArquivo $origens[$arq] (Join-Path $alvo.sfx $arq)
    $escritos += 1
  }

  Set-SndEstado ([pscustomobject]@{
    instaladoId = $id
    sha256Resident = Get-SndHash (Join-Path $alvo.sfx 'RESIDENT.rpf')
    geracao = $alvo.geracao
    quando = (Get-Date -Format 'o')
  })

  [pscustomobject]@{
    id = $id
    backupCriado = $backupCriado
    arquivos = $escritos
    origin = 'measured'
  } | ConvertTo-Json -Compress
  exit 0
}

if ($acao -eq 'restore') {
  Test-SndFechado
  $alvo = Get-SndAlvo
  if (-not $alvo) { throw 'ERR_SND_SEM_GTA' }
  if (-not (Test-SndBackupCompleto)) { throw 'ERR_SND_SEM_BACKUP' }

  $escritos = 0
  foreach ($arq in $SndPermitidos) {
    Copy-SndArquivo (Join-Path $SndBackup $arq) (Join-Path $alvo.sfx $arq)
    $escritos += 1
  }

  # O backup fica onde está: é o vanilla, serve pra próxima restauração também.
  Set-SndEstado ([pscustomobject]@{
    instaladoId = $null
    sha256Resident = $null
    geracao = $alvo.geracao
    quando = (Get-Date -Format 'o')
  })

  [pscustomobject]@{ arquivos = $escritos; origin = 'measured' } | ConvertTo-Json -Compress
  exit 0
}

if ($acao -eq 'preview') {
  $pasta = Get-SndPastaPack $env:PLFCORE_SOUNDS_PACK
  $video = Join-Path $pasta 'preview.mp4'
  if (-not (Test-Path -LiteralPath $video -PathType Leaf)) { throw 'ERR_SND_PACK' }
  Start-Process -FilePath $video | Out-Null
  [pscustomobject]@{ arquivos = 0; origin = 'measured' } | ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_SND_ACTION'
