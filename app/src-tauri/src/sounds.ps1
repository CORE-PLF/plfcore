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
# Uma pasta de backup POR GERAÇÃO. Quem tem Legacy pro FiveM e Enhanced pra
# jogar sozinho tem dois vanilla diferentes, e restaurar o de um no outro
# entrega um .rpf que o jogo não carrega.
$SndBackupRaiz = Join-Path $SndRaiz 'backup\sounds'
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

# Geração pelo executável que existe na raiz, nunca por chute. Enhanced tem um
# exe próprio; se só há GTA5.exe, é Legacy.
function Get-SndGeracao([string]$raiz) {
  if (Test-Path -LiteralPath (Join-Path $raiz 'GTA5_Enhanced.exe')) { return 'enhanced' }
  if (Test-Path -LiteralPath (Join-Path $raiz 'GTA5.exe')) { return 'legacy' }
  return $null
}

function New-SndAlvo([string]$raiz, [string]$origem) {
  if (-not $raiz) { return $null }
  $sfx = Join-Path $raiz 'x64\audio\sfx'
  if (-not (Test-Path -LiteralPath (Join-Path $sfx 'WEAPONS_PLAYER.rpf'))) { return $null }
  $geracao = Get-SndGeracao $raiz
  if (-not $geracao) { return $null }
  return [pscustomobject]@{ raiz = $raiz; sfx = $sfx; geracao = $geracao; origem = $origem }
}

# Alvo do som, em ordem de prioridade. Quem tem as duas gerações instaladas
# quase sempre quer a que o FiveM carrega — e o pure mode, que é o motivo deste
# módulo existir, só acontece lá. Por isso o IVPath do CitizenFX.ini manda:
# é o GTA que o FiveM abre de verdade. Sem FiveM, Legacy antes de Enhanced,
# porque os packs de pure mode são feitos pro Legacy.
function Get-SndAlvo {
  $ini = Join-Path $env:LOCALAPPDATA 'FiveM\FiveM.app\CitizenFX.ini'
  if (Test-Path -LiteralPath $ini) {
    foreach ($linha in @(Get-Content -LiteralPath $ini -ErrorAction SilentlyContinue)) {
      $t = ([string]$linha).Trim()
      if ($t -match '^IVPath\s*=\s*(.+)$') {
        $alvo = New-SndAlvo ($Matches[1].Trim()) 'fivem'
        if ($alvo) { return $alvo }
      }
    }
  }

  # Sem FiveM: procura as duas gerações e prefere Legacy.
  $achados = @()
  foreach ($exe in @((Get-SteamAppPath '271590' 'GTA5.exe'), (Get-SteamAppPath '3240220' 'GTA5_Enhanced.exe'))) {
    if ($exe) { $achados += (Split-Path -Parent $exe) }
  }
  foreach ($chave in @('HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V', 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V Enhanced')) {
    try {
      $base = (Get-ItemProperty -LiteralPath $chave -ErrorAction Stop).InstallFolder
      if ($base) { $achados += [string]$base }
    } catch {}
  }

  foreach ($preferida in @('legacy', 'enhanced')) {
    foreach ($raiz in ($achados | Select-Object -Unique)) {
      $alvo = New-SndAlvo $raiz 'instalado'
      if ($alvo -and $alvo.geracao -eq $preferida) { return $alvo }
    }
  }
  return $null
}

function Get-SndBackup($alvo) {
  return Join-Path $SndBackupRaiz ([string]$alvo.geracao)
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

function Test-SndBackupCompleto([string]$backup) {
  foreach ($arq in $SndPermitidos) {
    if (-not (Test-Path -LiteralPath (Join-Path $backup $arq) -PathType Leaf)) { return $false }
  }
  return $true
}

# Todo sha256 declarado pelos packs da biblioteca. Serve pra reconhecer um mod
# que já está no jogo.
function Get-SndHashesDePack {
  $hashes = @{}
  if (-not (Test-Path -LiteralPath $SndBiblioteca -PathType Container)) { return $hashes }
  foreach ($dir in @(Get-ChildItem -LiteralPath $SndBiblioteca -Directory -ErrorAction SilentlyContinue)) {
    $metaArq = Join-Path $dir.FullName 'pack.json'
    if (-not (Test-Path -LiteralPath $metaArq)) { continue }
    try {
      $meta = Get-Content -LiteralPath $metaArq -Raw | ConvertFrom-Json
      if ($meta.sha256) {
        foreach ($prop in $meta.sha256.PSObject.Properties) {
          $hashes[([string]$prop.Value).ToLowerInvariant()] = $dir.Name
        }
      }
    } catch {}
  }
  return $hashes
}

# Guarda o estado ATUAL da máquina como "original". Só roda quando ainda não há
# backup desta geração: rodar por cima faria o mod anterior virar o original.
#
# Se o que está no jogo já é um pack conhecido, NÃO guarda nada e devolve $false:
# gravar um mod como "original" destruiria o caminho de volta em silêncio. A
# instalação segue mesmo assim — trocar um pack por outro não perde nada, e o
# vanilla dessa pessoa está na Steam de qualquer jeito.
function Save-SndBackup([string]$sfx, [string]$backup) {
  if (Test-SndBackupCompleto $backup) { return $false }

  $conhecidos = Get-SndHashesDePack
  foreach ($arq in $SndPermitidos) {
    $origem = Join-Path $sfx $arq
    if (-not (Test-Path -LiteralPath $origem -PathType Leaf)) { throw 'ERR_SND_COPIA' }
    if ($conhecidos.Count -gt 0 -and $conhecidos.ContainsKey((Get-SndHash $origem))) {
      return $false
    }
  }

  New-Item -ItemType Directory -Force -Path $backup | Out-Null
  foreach ($arq in $SndPermitidos) {
    Copy-Item -LiteralPath (Join-Path $sfx $arq) -Destination (Join-Path $backup $arq) -Force
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

  # Quem manda é o arquivo que está no jogo AGORA, não o que o app anotou.
  # O estado serve de atalho; se não bater, o hash decide. Assim um pack que a
  # pessoa instalou na mão, antes de conhecer o app, aparece como instalado —
  # e ela entende por que a instalação vai recusar até ter o original de volta.
  $instaladoId = $null
  $vanillaSumiu = $false
  if ($alvo) {
    $atual = Join-Path $alvo.sfx 'RESIDENT.rpf'
    if (Test-Path -LiteralPath $atual -PathType Leaf) {
      try {
        $hashAtual = Get-SndHash $atual
        $estado = Get-SndEstado
        if ($estado -and $estado.instaladoId -and $hashAtual -eq [string]$estado.sha256Resident) {
          $instaladoId = [string]$estado.instaladoId
        } else {
          $conhecidos = Get-SndHashesDePack
          if ($conhecidos.ContainsKey($hashAtual)) { $instaladoId = [string]$conhecidos[$hashAtual] }
        }
        # Tem mod no jogo e nenhum backup: o original só volta pela Steam.
        if ($instaladoId -and -not (Test-SndBackupCompleto (Get-SndBackup $alvo))) {
          $vanillaSumiu = $true
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
    alvoOrigem = if ($alvo) { [string]$alvo.origem } else { $null }
    jogoAberto = $aberto
    biblioteca = $SndBiblioteca
    temBackup = if ($alvo) { Test-SndBackupCompleto (Get-SndBackup $alvo) } else { $false }
    instaladoId = $instaladoId
    vanillaSumiu = $vanillaSumiu
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

  $backupCriado = Save-SndBackup $alvo.sfx (Get-SndBackup $alvo)

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
  $backup = Get-SndBackup $alvo
  if (-not (Test-SndBackupCompleto $backup)) { throw 'ERR_SND_SEM_BACKUP' }

  $escritos = 0
  foreach ($arq in $SndPermitidos) {
    Copy-SndArquivo (Join-Path $backup $arq) (Join-Path $alvo.sfx $arq)
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
