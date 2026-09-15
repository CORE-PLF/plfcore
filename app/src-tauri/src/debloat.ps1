$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Catalog = [ordered]@{
  'quick-assist'    = @('MicrosoftCorporationII.QuickAssist')
  'feedback-hub'    = @('Microsoft.WindowsFeedbackHub')
  'copilot'         = @('Microsoft.Copilot')
  'weather'         = @('Microsoft.BingWeather')
  'family'          = @('MicrosoftCorporationII.MicrosoftFamily')
  'office-hub'      = @('Microsoft.MicrosoftOfficeHub')
  'bing-search'     = @('Microsoft.BingSearch')
  'clipchamp'       = @('Clipchamp.Clipchamp')
  'teams'           = @('MSTeams', 'MicrosoftTeams')
  'todo'            = @('Microsoft.Todos')
  'bing-news'       = @('Microsoft.BingNews')
  'outlook'         = @('Microsoft.OutlookForWindows')
  'alarms'          = @('Microsoft.WindowsAlarms')
  'solitaire'       = @('Microsoft.MicrosoftSolitaireCollection')
  'power-automate'  = @('Microsoft.PowerAutomateDesktop')
  'dev-home'        = @('Microsoft.Windows.DevHome', 'Microsoft.WindowsDevHome')
  'get-help'        = @('Microsoft.GetHelp')
  'get-started'     = @('Microsoft.Getstarted')
  'sticky-notes'    = @('Microsoft.MicrosoftStickyNotes')
  'camera'          = @('Microsoft.WindowsCamera')
  'sound-recorder'  = @('Microsoft.WindowsSoundRecorder')
  'snipping-tool'   = @('Microsoft.ScreenSketch')
  'onedrive'        = @('Microsoft.OneDriveSync')
  'xbox-suite'      = @('Microsoft.GamingApp', 'Microsoft.Xbox.TCUI', 'Microsoft.XboxApp', 'Microsoft.XboxGameOverlay', 'Microsoft.XboxGamingOverlay', 'Microsoft.XboxIdentityProvider', 'Microsoft.XboxSpeechToTextOverlay')
  'phone-link'      = @('Microsoft.YourPhone')
  'maps'            = @('Microsoft.WindowsMaps')
  'people'          = @('Microsoft.People')
  'mixed-reality'   = @('Microsoft.MixedReality.Portal')
  'mail-calendar'   = @('microsoft.windowscommunicationsapps')
  'movies-tv'       = @('Microsoft.ZuneVideo')
  'media-player'    = @('Microsoft.ZuneMusic')
}

function Get-OneDriveInstalled {
  if (Get-Process -Name 'OneDrive' -ErrorAction SilentlyContinue) { return $true }
  if (Test-Path -LiteralPath "$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe") { return $true }
  $uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  return [bool](Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like 'Microsoft OneDrive*' } | Select-Object -First 1)
}

function Get-InstalledNames {
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  try {
    Get-AppxPackage -AllUsers -ErrorAction Stop | ForEach-Object { [void]$names.Add($_.Name) }
  } catch {
    Get-AppxPackage -ErrorAction SilentlyContinue | ForEach-Object { [void]$names.Add($_.Name) }
  }
  try {
    Get-AppxProvisionedPackage -Online -ErrorAction Stop | ForEach-Object { [void]$names.Add($_.DisplayName) }
  } catch {
  }
  return ,$names
}

function Test-CatalogItemInstalled([string]$Id, $Names) {
  foreach ($packageName in $Catalog[$Id]) {
    if ($Names.Contains($packageName)) { return $true }
  }
  if ($Id -eq 'onedrive') { return Get-OneDriveInstalled }
  return $false
}

function Remove-OneDriveDesktop {
  if (-not (Get-OneDriveInstalled)) { return $false }
  Get-Process -Name 'OneDrive' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $setup = @(
    "$env:SystemRoot\System32\OneDriveSetup.exe",
    "$env:SystemRoot\SysWOW64\OneDriveSetup.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $setup) { throw 'ERR_ONEDRIVE_UNINSTALLER_NOT_FOUND' }
  $process = Start-Process -FilePath $setup -ArgumentList '/uninstall' -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "ERR_ONEDRIVE_UNINSTALL_$($process.ExitCode)" }
  return $true
}

function Remove-CatalogItem([string]$Id) {
  $removed = 0
  $found = 0
  $errors = New-Object 'System.Collections.Generic.List[string]'

  foreach ($packageName in $Catalog[$Id]) {
    $installed = @(Get-AppxPackage -AllUsers -Name $packageName -ErrorAction SilentlyContinue)
    foreach ($package in $installed) {
      $found += 1
      try {
        if ($package.NonRemovable) { throw 'ERR_APPX_NON_REMOVABLE' }
        Remove-AppxPackage -Package $package.PackageFullName -AllUsers -Confirm:$false -ErrorAction Stop
        $removed += 1
      } catch {
        $errors.Add(($_.Exception.Message -replace '[\r\n]+', ' '))
      }
    }

    $provisioned = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -ieq $packageName })
    foreach ($package in $provisioned) {
      $found += 1
      try {
        Remove-AppxProvisionedPackage -Online -AllUsers -PackageName $package.PackageName -ErrorAction Stop | Out-Null
        $removed += 1
      } catch {
        $errors.Add(($_.Exception.Message -replace '[\r\n]+', ' '))
      }
    }
  }

  if ($Id -eq 'onedrive') {
    try {
      if (Remove-OneDriveDesktop) { $found += 1; $removed += 1 }
    } catch {
      $found += 1
      $errors.Add(($_.Exception.Message -replace '[\r\n]+', ' '))
    }
  }

  $status = if ($removed -gt 0) { 'removed' } elseif ($found -eq 0) { 'not-installed' } else { 'failed' }
  [pscustomobject]@{
    id = $Id
    status = $status
    errorCode = if ($errors.Count -gt 0) { 'ERR_DEBLOAT_ITEM_FAILED' } else { $null }
    details = if ($errors.Count -gt 0) { ($errors -join ' | ') } else { $null }
  }
}

$action = $env:PLFCORE_DEBLOAT_ACTION
if ($action -eq 'scan') {
  $names = Get-InstalledNames
  $items = foreach ($id in $Catalog.Keys) {
    [pscustomobject]@{ id = $id; installed = [bool](Test-CatalogItemInstalled $id $names) }
  }
  [pscustomobject]@{ items = @($items); origin = 'measured' } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

if ($action -eq 'restore') {
  try {
    Checkpoint-Computer -Description 'PLF CORE - ANTES DO DEBLOAT' -RestorePointType 'APPLICATION_UNINSTALL' -ErrorAction Stop
    [pscustomobject]@{ created = $true; message = $null; origin = 'measured' } | ConvertTo-Json -Compress
  } catch {
    [pscustomobject]@{ created = $false; message = 'RESTORE_POINT_UNAVAILABLE'; origin = 'measured' } | ConvertTo-Json -Compress
  }
  exit 0
}

if ($action -eq 'remove') {
  $id = $env:PLFCORE_DEBLOAT_ID
  if (-not $Catalog.Contains($id)) { throw 'ERR_DEBLOAT_NOT_ALLOWED' }
  Remove-CatalogItem $id | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

throw 'ERR_DEBLOAT_ACTION'
