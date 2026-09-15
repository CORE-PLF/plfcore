$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Catalogo = @('cs2', 'lol', 'fivem', 'valorant', 'fortnite', 'gta5', 'rocketleague', 'apex', 'dota2', 'r6', 'overwatch2', 'cod', 'pubg', 'roblox')

function Get-DirBytes([string]$path) {
  try {
    $soma = (Get-ChildItem -LiteralPath $path -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $soma) { return 0 }
    return [int64]$soma
  } catch { return 0 }
}

function Test-GpuPreference([string]$exe) {
  try {
    $valor = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' -ErrorAction Stop).$exe
    return ([string]$valor -match 'GpuPreference=2')
  } catch { return $false }
}

function Test-FullscreenOptOff([string]$exe) {
  try {
    $valor = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers' -ErrorAction Stop).$exe
    return ([string]$valor -match 'DISABLEDXMAXIMIZEDWINDOWEDMODE')
  } catch { return $false }
}

function Test-CpuPriority([string]$exe) {
  $nome = Split-Path -Leaf $exe
  $key = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$nome\PerfOptions"
  try {
    return ([int](Get-ItemPropertyValue -LiteralPath $key -Name 'CpuPriorityClass' -ErrorAction Stop) -eq 3)
  } catch { return $false }
}

$acao = $env:PLFCORE_GAMES_ACTION

if ($acao -eq 'scan') {
  $itens = foreach ($id in $Catalogo) {
    $exe = Get-GameExe $id
    $dirs = if ($exe) { @(Get-GameCacheDirs $id) } else { @() }
    $bytes = 0
    foreach ($d in $dirs) { $bytes += Get-DirBytes $d }
    [pscustomobject]@{
      id = $id
      instalado = [bool]$exe
      caminho = $exe
      tuning = (Get-GameTuning $id)
      cacheBytes = $bytes
      cachePastas = $dirs.Count
      gpuAlta = if ($exe) { Test-GpuPreference $exe } else { $false }
      telaCheiaDireta = if ($exe) { Test-FullscreenOptOff $exe } else { $false }
      prioridadeAlta = if ($exe) { Test-CpuPriority $exe } else { $false }
    }
  }
  [pscustomobject]@{ items = @($itens); origin = 'measured' } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

if ($acao -eq 'clean') {
  $id = $env:PLFCORE_GAMES_ID
  if ($Catalogo -notcontains $id) { throw 'ERR_GAME_NOT_ALLOWED' }
  foreach ($processo in (Get-GameProcessNames $id)) {
    if (Get-Process -Name $processo -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
  }

  $liberado = 0
  $pastas = 0
  $falhas = 0
  foreach ($dir in (Get-GameCacheDirs $id)) {
    $antes = Get-DirBytes $dir
    try {
      Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
      }
      $depois = Get-DirBytes $dir
      $liberado += [math]::Max(0, $antes - $depois)
      $pastas += 1
    } catch {
      $falhas += 1
    }
  }
  [pscustomobject]@{ id = $id; liberadoBytes = $liberado; pastas = $pastas; falhas = $falhas; origin = 'measured' } |
    ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_GAMES_ACTION'
