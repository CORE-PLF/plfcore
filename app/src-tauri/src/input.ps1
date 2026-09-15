$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegInt([string]$path, [string]$name) {
  try { return [int](Get-ItemPropertyValue -LiteralPath $path -Name $name -ErrorAction Stop) } catch { return $null }
}
function Sourced($value) {
  if ($null -eq $value) { return $null }
  return @{ value = $value; origin = 'measured' }
}
function Estimated($value) {
  if ($null -eq $value) { return $null }
  return @{ value = $value; origin = 'estimated' }
}
function Get-NominalPolling([string]$name) {
  if ($name -match '(?i)(G502.*LIGHTSPEED|G915.*TKL)') { return 1000 }
  return $null
}
function Get-MaxDpi([string]$name) {
  if ($name -match '(?i)G502.*LIGHTSPEED') { return 25600 }
  return $null
}
function Get-Connection([string]$name, [string]$pnpId) {
  if ($name -match '(?i)(LIGHTSPEED|G915.*TKL)') { return Estimated 'LIGHTSPEED / USB' }
  if ($pnpId -match '(?i)^BTH') { return Sourced 'BLUETOOTH' }
  if ($pnpId -match '(?i)^(USB|HID)\\') { return Sourced 'USB / HID' }
  return $null
}

$devices = @()
$mouse = Get-CimInstance Win32_PointingDevice | Select-Object -First 1
if ($mouse) {
  $mouseName = Get-MouseModel
  if (-not $mouseName) { $mouseName = [string]$mouse.Name }
  $speed = Read-RegInt 'HKCU:\Control Panel\Mouse' 'MouseSpeed'
  $threshold1 = Read-RegInt 'HKCU:\Control Panel\Mouse' 'MouseThreshold1'
  $threshold2 = Read-RegInt 'HKCU:\Control Panel\Mouse' 'MouseThreshold2'
  $pointerSpeed = Read-RegInt 'HKCU:\Control Panel\Mouse' 'MouseSensitivity'
  $polling = Get-NominalPolling $mouseName
  $acceleration = $null
  if ($null -ne $speed -and $null -ne $threshold1 -and $null -ne $threshold2) {
    $acceleration = ($speed -ne 0 -or $threshold1 -ne 0 -or $threshold2 -ne 0)
  }
  $devices += @{
    nome = [string]$mouseName
    tipo = 'mouse'
    taxaHz = $polling
    taxaHzOrigin = if ($null -ne $polling) { 'estimated' } else { $null }
    dpi = $null
    dpiMax = Estimated (Get-MaxDpi $mouseName)
    latenciaMs = if ($null -ne $polling) { Estimated (1000.0 / $polling) } else { $null }
    conexao = Get-Connection $mouseName ([string]$mouse.PNPDeviceID)
    pointerSpeed = Sourced $pointerSpeed
    mouseAcceleration = Sourced $acceleration
    keyboardRepeatRate = $null
    keyboardRepeatDelay = $null
  }
}

$keyboard = Get-CimInstance Win32_Keyboard | Select-Object -First 1
if ($keyboard) {
  $keyboardName = Get-KeyboardModel
  if (-not $keyboardName) { $keyboardName = [string]$keyboard.Name }
  $rate = Read-RegInt 'HKCU:\Control Panel\Keyboard' 'KeyboardSpeed'
  $delay = Read-RegInt 'HKCU:\Control Panel\Keyboard' 'KeyboardDelay'
  $polling = Get-NominalPolling $keyboardName
  $devices += @{
    nome = [string]$keyboardName
    tipo = 'teclado'
    taxaHz = $polling
    taxaHzOrigin = if ($null -ne $polling) { 'estimated' } else { $null }
    dpi = $null
    dpiMax = $null
    latenciaMs = if ($null -ne $polling) { Estimated (1000.0 / $polling) } else { $null }
    conexao = Get-Connection $keyboardName ([string]$keyboard.PNPDeviceID)
    pointerSpeed = $null
    mouseAcceleration = $null
    keyboardRepeatRate = Sourced $rate
    keyboardRepeatDelay = Sourced $delay
  }
}

@($devices) | ConvertTo-Json -Depth 5 -Compress
