function Test-GenericInputName([string]$name) {
  if ([string]::IsNullOrWhiteSpace($name)) { return $true }
  return $name -match '(?i)^(HID[- ]compliant|Mouse compat.vel com HID|Dispositivo de teclado HID|Dispositivo de Entrada USB|USB Input Device|Enhanced \(|Aperfei.oado \(|LIGHTSPEED Receiver|USB Receiver|USB Composite Device|Dispositivo definido pelo fornecedor|Controlador de sistema compat.vel com HID)'
}

$script:PresentPnpDevices = $null
function Get-PresentPnpDevices {
  if ($null -eq $script:PresentPnpDevices) {
    $script:PresentPnpDevices = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' })
  }
  return @($script:PresentPnpDevices)
}

function Resolve-InputModel([string]$className, [string]$preferredPattern, [string]$rejectedPattern) {
  $fallback = $null
  $present = @(Get-PresentPnpDevices)

  foreach ($device in $present) {
    if ([string]$device.InstanceId -notmatch 'VID_') { continue }
    $candidate = [string]$device.FriendlyName
    if (Test-GenericInputName $candidate) { continue }
    if ($rejectedPattern -and $candidate -match $rejectedPattern) { continue }
    if ($candidate -match $preferredPattern) { return $candidate.Trim() }
  }

  $devices = @($present | Where-Object { $_.Class -eq $className })
  foreach ($device in $devices) {
    $instanceId = [string]$device.InstanceId
    for ($level = 0; $level -lt 4 -and $instanceId; $level++) {
      $current = Get-PnpDevice -InstanceId $instanceId -ErrorAction SilentlyContinue
      $busName = (Get-PnpDeviceProperty -InstanceId $instanceId -KeyName 'DEVPKEY_Device_BusReportedDeviceDesc' -ErrorAction SilentlyContinue).Data
      foreach ($candidate in @([string]$busName, [string]$current.FriendlyName)) {
        if (Test-GenericInputName $candidate) { continue }
        if ($rejectedPattern -and $candidate -match $rejectedPattern) { continue }
        if ($candidate -match $preferredPattern) { return $candidate.Trim() }
        if (-not $fallback) { $fallback = $candidate.Trim() }
      }
      $instanceId = [string](Get-PnpDeviceProperty -InstanceId $instanceId -KeyName 'DEVPKEY_Device_Parent' -ErrorAction SilentlyContinue).Data
    }
  }
  return $fallback
}

function Get-MouseModel {
  return Resolve-InputModel 'Mouse' '(?i)(mouse|trackball|touchpad|g[2345678][0-9]{2})' '(?i)(keyboard|teclado|keypad|tkl)'
}

function Get-KeyboardModel {
  return Resolve-InputModel 'Keyboard' '(?i)(keyboard|teclado|keypad|tkl|keychron|ducky|alloy|huntsman|blackwidow|apex)' '(?i)(mouse|trackball|touchpad)'
}
