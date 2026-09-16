$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$action = [string]$env:PLFCORE_OPT_ACTION
$profile = [string]$env:PLFCORE_OPT_PROFILE
$stateDir = Join-Path $env:LOCALAPPDATA 'PLFCore'
$restoreFile = Join-Path $stateDir 'restore.json'
$mutex = New-Object System.Threading.Mutex($false, 'Local\PLFCoreOptimization')
$locked = $false
$stateLoaded = $false

function Save-State {
  $tmp = Join-Path $stateDir ("restore-{0}-{1}.tmp" -f $PID, [guid]::NewGuid().ToString('N'))
  $script:restore | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $restoreFile -Force
}

function Ensure-State {
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  if (Test-Path -LiteralPath $restoreFile) {
    $script:restore = Get-Content -LiteralPath $restoreFile -Raw | ConvertFrom-Json
    if ($null -eq $script:restore.registry) {
      $script:restore | Add-Member -NotePropertyName registry -NotePropertyValue @() -Force
    }
    if ($null -eq $script:restore.activeProfiles) {
      $script:restore | Add-Member -NotePropertyName activeProfiles -NotePropertyValue @() -Force
    }
    if ($null -eq $script:restore.services) {
      $script:restore | Add-Member -NotePropertyName services -NotePropertyValue @() -Force
    }
    if ($null -eq $script:restore.tasks) {
      $script:restore | Add-Member -NotePropertyName tasks -NotePropertyValue @() -Force
    }
    if ($null -eq $script:restore.createdPowerPlan) {
      $script:restore | Add-Member -NotePropertyName createdPowerPlan -NotePropertyValue $null -Force
    }
  } else {
    $script:restore = [pscustomobject][ordered]@{
      version = 2
      createdAt = [DateTime]::UtcNow.ToString('o')
      powerPlan = $null
      registry = @()
      services = @()
      tasks = @()
      createdPowerPlan = $null
      activeProfiles = @()
    }
  }
}

function Save-RegBaseline([string]$path, [string]$name) {
  $known = @($script:restore.registry | Where-Object { $_.path -eq $path -and $_.name -eq $name })
  if ($known.Count -gt 0) { return }

  $exists = $false
  $value = $null
  $kind = 'String'
  if (Test-Path -LiteralPath $path) {
    $key = Get-Item -LiteralPath $path
    $exists = @($key.GetValueNames()) -contains $name
    if ($exists) {
      $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $kind = [string]$key.GetValueKind($name)
    }
  }
  $entry = [pscustomobject][ordered]@{ path = $path; name = $name; existed = $exists; value = $value; kind = $kind }
  $script:restore.registry = @($script:restore.registry) + @($entry)
}

function Set-Reg([string]$path, [string]$name, $value, [string]$kind = 'DWord') {
  Save-RegBaseline $path $name
  Save-State
  if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -Value $value -PropertyType $kind -Force | Out-Null
}

function Save-ServiceBaseline([string]$name) {
  if (@($script:restore.services | Where-Object { $_.name -eq $name }).Count -gt 0) { return }
  $svc = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $name.Replace("'", "''")) -ErrorAction SilentlyContinue
  if ($null -eq $svc) { return }
  $entry = [pscustomobject][ordered]@{
    name = $name
    startMode = [string]$svc.StartMode
    wasRunning = ([string]$svc.State -eq 'Running')
  }
  $script:restore.services = @($script:restore.services) + @($entry)
  Save-State
}

function Set-LiteService([string]$name) {
  $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $svc) { return $false }
  Save-ServiceBaseline $name
  if ($svc.Status -eq 'Running' -and $svc.CanStop) {
    Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
  }
  Set-Service -Name $name -StartupType Manual -ErrorAction SilentlyContinue
  return $true
}

function Save-TaskBaseline([string]$path, [string]$name) {
  $key = "$path|$name"
  if (@($script:restore.tasks | Where-Object { $_.key -eq $key }).Count -gt 0) { return }
  $task = Get-ScheduledTask -TaskPath $path -TaskName $name -ErrorAction SilentlyContinue
  if ($null -eq $task) { return }
  $entry = [pscustomobject][ordered]@{ key = $key; path = $path; name = $name; wasEnabled = ([string]$task.State -ne 'Disabled') }
  $script:restore.tasks = @($script:restore.tasks) + @($entry)
  Save-State
}

function Disable-LiteTask([string]$path, [string]$name) {
  $task = Get-ScheduledTask -TaskPath $path -TaskName $name -ErrorAction SilentlyContinue
  if ($null -eq $task) { return $false }
  Save-TaskBaseline $path $name
  Disable-ScheduledTask -TaskPath $path -TaskName $name -ErrorAction SilentlyContinue | Out-Null
  return $true
}

function Get-ActivePowerGuid {
  $text = powercfg /getactivescheme 2>$null | Out-String
  $match = [regex]::Match($text, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
  if ($match.Success) { return $match.Value.ToLowerInvariant() }
  return $null
}

function Restore-All {
  foreach ($entry in @($script:restore.registry)) {
    if ([bool]$entry.existed) {
      if (-not (Test-Path -LiteralPath ([string]$entry.path))) {
        New-Item -Path ([string]$entry.path) -Force | Out-Null
      }
      New-ItemProperty -LiteralPath ([string]$entry.path) -Name ([string]$entry.name) -Value $entry.value -PropertyType ([string]$entry.kind) -Force | Out-Null
    } elseif (Test-Path -LiteralPath ([string]$entry.path)) {
      Remove-ItemProperty -LiteralPath ([string]$entry.path) -Name ([string]$entry.name) -ErrorAction SilentlyContinue
    }
  }
  foreach ($entry in @($script:restore.services)) {
    $startup = switch ([string]$entry.startMode) {
      'Auto' { 'Automatic' }
      'Disabled' { 'Disabled' }
      default { 'Manual' }
    }
    Set-Service -Name ([string]$entry.name) -StartupType $startup -ErrorAction SilentlyContinue
    if ([bool]$entry.wasRunning) {
      Start-Service -Name ([string]$entry.name) -ErrorAction SilentlyContinue
    } else {
      Stop-Service -Name ([string]$entry.name) -Force -ErrorAction SilentlyContinue
    }
  }
  foreach ($entry in @($script:restore.tasks)) {
    if ([bool]$entry.wasEnabled) {
      Enable-ScheduledTask -TaskPath ([string]$entry.path) -TaskName ([string]$entry.name) -ErrorAction SilentlyContinue | Out-Null
    } else {
      Disable-ScheduledTask -TaskPath ([string]$entry.path) -TaskName ([string]$entry.name) -ErrorAction SilentlyContinue | Out-Null
    }
  }
  if ($script:restore.powerPlan -and $script:restore.powerPlan -match '^[0-9a-fA-F-]{36}$') {
    powercfg /setactive ([string]$script:restore.powerPlan) 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'ERR_POWER_RESTORE' }
  }
  if ($script:restore.createdPowerPlan -and $script:restore.createdPowerPlan -match '^[0-9a-fA-F-]{36}$') {
    powercfg /delete ([string]$script:restore.createdPowerPlan) 2>$null | Out-Null
  }
}

$PlanoNome = 'PLF CORE - MAX PERFORMANCE'
# Nome usado pela versão antiga do produto. Quem já rodava aquela build tem esse
# plano na máquina: adotamos e renomeamos, em vez de empilhar um segundo.
$PlanoNomesAntigos = @('RESYNC - MAX PERFORMANCE')

function Get-PlanoPLF {
  $linhas = powercfg /list 2>$null | Out-String
  foreach ($nome in @(@($PlanoNome) + $PlanoNomesAntigos)) {
    foreach ($linha in ($linhas -split "`r?`n")) {
      if ($linha -like "*$nome*") {
        $achado = [regex]::Match($linha, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
        if ($achado.Success) {
          $guid = $achado.Value.ToLowerInvariant()
          if ($nome -ne $PlanoNome) {
            powercfg /changename $guid $PlanoNome 'Plano reversível gerenciado pelo PLF CORE' 2>$null | Out-Null
          }
          return $guid
        }
      }
    }
  }
  return $null
}

function New-PlanoPLF {
  # Ultimate Performance é oculto e não existe em todo SKU; alto desempenho é o piso.
  foreach ($base in @('e9a42b02-d5df-448d-aa00-03f14749eb61', '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c')) {
    $criado = powercfg /duplicatescheme $base 2>$null | Out-String
    $achado = [regex]::Match($criado, '(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b')
    if ($achado.Success) { return $achado.Value.ToLowerInvariant() }
  }
  return $null
}

function Apply-PowerPlan([System.Collections.ArrayList]$applied, [bool]$aggressive = $false) {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { return }
  if (-not $script:restore.powerPlan) { $script:restore.powerPlan = Get-ActivePowerGuid }
  Save-State
  $target = [string]$script:restore.createdPowerPlan
  if (-not ($target -match '^[0-9a-fA-F-]{36}$')) {
    # Reaproveita o plano de uma execução anterior: sem isso cada rodada empilha um plano novo.
    $target = Get-PlanoPLF
  }
  if (-not ($target -match '^[0-9a-fA-F-]{36}$')) {
    $target = New-PlanoPLF
    if (-not $target) { throw 'ERR_POWER_HIGH_UNAVAILABLE' }
    powercfg /changename $target $PlanoNome 'Plano reversível gerenciado pelo PLF CORE' 2>$null | Out-Null
  }
  if ([string]$script:restore.createdPowerPlan -ne $target) {
    $script:restore.createdPowerPlan = $target
    Save-State
  }
  if ($aggressive) {
    powercfg /setacvalueindex $target SUB_PROCESSOR PROCTHROTTLEMIN 100 2>$null | Out-Null
    powercfg /setacvalueindex $target SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null | Out-Null
    powercfg /setacvalueindex $target '2a737441-1930-4402-8d77-b2bebba308a3' '48e6b7a6-50f5-4782-a5d4-53bb8f07e226' 0 2>$null | Out-Null
    powercfg /setacvalueindex $target '501a4d13-42af-4429-9fd1-a8218c268e20' 'ee12f906-d277-404b-b6da-e5fa1a576df5' 0 2>$null | Out-Null
    powercfg /setacvalueindex $target SUB_PROCESSOR CPMINCORES 100 2>$null | Out-Null
    powercfg /setacvalueindex $target SUB_PROCESSOR PERFBOOSTMODE 2 2>$null | Out-Null
    # Só no plano do PLF CORE e só na tomada: reverter apaga o plano e leva junto.
    powercfg /setacvalueindex $target SUB_SLEEP STANDBYIDLE 0 2>$null | Out-Null
    powercfg /setacvalueindex $target SUB_SLEEP HIBERNATEIDLE 0 2>$null | Out-Null
    [void]$applied.Add('cpu-resposta-max')
    [void]$applied.Add('energia-usb-off')
    [void]$applied.Add('pcie-link-off')
    [void]$applied.Add('nucleos-sem-estacionamento')
    [void]$applied.Add('cpu-boost-agressivo')
    [void]$applied.Add('suspensao-nunca')
  }
  powercfg /setactive $target 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'ERR_POWER_HIGH_FAILED' }
  [void]$applied.Add('plano-energia-alto')
}

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-SystemDriveIsSolid {
  try {
    $particao = Get-Partition -DriveLetter ([string]$env:SystemDrive)[0] -ErrorAction Stop
    $disco = Get-PhysicalDisk -ErrorAction Stop | Where-Object { $_.DeviceId -eq [string]$particao.DiskNumber } | Select-Object -First 1
    if ($null -eq $disco) { return $false }
    return ([string]$disco.MediaType -eq 'SSD' -or [int]$disco.BusType -eq 17)
  } catch { return $false }
}

function Get-ActiveInterfaceGuid {
  try {
    $indice = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
      Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1 -ExpandProperty InterfaceIndex
    $adaptador = Get-NetAdapter -InterfaceIndex $indice -ErrorAction Stop
    $guid = [string]$adaptador.InterfaceGuid
    if ($guid -match '^\{[0-9A-Fa-f-]{36}\}$') { return $guid }
  } catch {}
  return $null
}

function Apply-GpuScheduling([System.Collections.ArrayList]$applied) {
  if (-not (Test-IsAdmin)) { return }
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode' 2
  [void]$applied.Add('gpu-agendamento-hardware')
}

function Apply-NetworkLatency([System.Collections.ArrayList]$applied) {
  if (-not (Test-IsAdmin)) { return }
  Set-Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile' 'NetworkThrottlingIndex' -1
  [void]$applied.Add('rede-sem-throttle')
  $guid = Get-ActiveInterfaceGuid
  if ($guid) {
    $interface = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$guid"
    if (Test-Path -LiteralPath $interface) {
      Set-Reg $interface 'TcpAckFrequency' 1
      Set-Reg $interface 'TCPNoDelay' 1
      [void]$applied.Add('rede-tcp-sem-espera')
    }
  }
}

function Apply-PowerThrottlingOff([System.Collections.ArrayList]$applied) {
  if (-not (Test-IsAdmin)) { return }
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' 'PowerThrottlingOff' 1
  [void]$applied.Add('power-throttling-off')
}

function Get-RegString([string]$path, [string]$name) {
  try { return [string](Get-ItemPropertyValue -LiteralPath $path -Name $name -ErrorAction Stop) } catch { return '' }
}

function Merge-GpuPreference([string]$atual) {
  $tokens = @()
  if ($atual) {
    $tokens = @($atual -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^GpuPreference=' })
  }
  $tokens += 'GpuPreference=2'
  return (($tokens -join ';') + ';')
}

function Merge-CompatLayer([string]$atual, [string]$camada) {
  $tokens = @()
  if ($atual) {
    $tokens = @($atual -split '\s+' | Where-Object { $_ -and $_ -ne '~' -and $_ -ne $camada })
  }
  return ((@('~') + $tokens + @($camada)) -join ' ')
}

function Apply-GameTuning([System.Collections.ArrayList]$applied, [string]$id) {
  $tuning = Get-GameTuning $id
  if ($tuning -eq 'nenhum') { throw 'ERR_GAME_NO_TUNING' }
  $exe = Get-GameExe $id
  if (-not $exe) { throw 'ERR_GAME_NOT_FOUND' }

  $gpuKey = 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences'
  Set-Reg $gpuKey $exe (Merge-GpuPreference (Get-RegString $gpuKey $exe)) 'String'
  [void]$applied.Add('jogo-gpu-alta')

  $layersKey = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'
  Set-Reg $layersKey $exe (Merge-CompatLayer (Get-RegString $layersKey $exe) 'DISABLEDXMAXIMIZEDWINDOWEDMODE') 'String'
  [void]$applied.Add('jogo-tela-cheia-direta')
  if ($tuning -eq 'completo' -and (Test-IsAdmin)) {
    $nome = Split-Path -Leaf $exe
    Set-Reg "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\$nome\PerfOptions" 'CpuPriorityClass' 3
    [void]$applied.Add('jogo-prioridade-alta')
  }
}

function Apply-GameMode([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 1
  Set-Reg 'HKCU:\Software\Microsoft\GameBar' 'AllowAutoGameMode' 1
  [void]$applied.Add('game-mode-registro')
}

function Apply-GameDvr([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 0
  Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0
  [void]$applied.Add('game-dvr-off')
}

function Apply-MmcssGaming([System.Collections.ArrayList]$applied) {
  $systemProfile = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
  $games = Join-Path $systemProfile 'Tasks\Games'
  Set-Reg $systemProfile 'SystemResponsiveness' 10
  Set-Reg $games 'GPU Priority' 8
  Set-Reg $games 'Priority' 6
  Set-Reg $games 'Scheduling Category' 'High' 'String'
  Set-Reg $games 'SFIO Priority' 'High' 'String'
  [void]$applied.Add('mmcss-jogos')
}

function Apply-ForegroundQos([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' 'DisableUserPresenceQos' 1
  [void]$applied.Add('qos-presenca-off')
}

function Apply-StartupResponsiveness([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' 0
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0
  Set-Reg 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' 'String'
  [void]$applied.Add('interface-responsiva')
}

function Apply-LiteServices([System.Collections.ArrayList]$applied) {
  $changed = 0
  foreach ($name in @('DiagTrack', 'MapsBroker', 'Fax', 'WMPNetworkSvc', 'RetailDemo', 'RemoteRegistry')) {
    if (Set-LiteService $name) { $changed++ }
  }
  if ($changed -gt 0) { [void]$applied.Add('servicos-lite') }
  if (Test-SystemDriveIsSolid) {
    if (Set-LiteService 'SysMain') { [void]$applied.Add('sysmain-ssd-off') }
  }
}

function Apply-LiteTasks([System.Collections.ArrayList]$applied) {
  $changed = 0
  $targets = @(
    @('\Microsoft\Windows\Application Experience\', 'Microsoft Compatibility Appraiser'),
    @('\Microsoft\Windows\Application Experience\', 'ProgramDataUpdater'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\', 'Consolidator'),
    @('\Microsoft\Windows\Customer Experience Improvement Program\', 'UsbCeip')
  )
  foreach ($target in $targets) {
    if (Disable-LiteTask ([string]$target[0]) ([string]$target[1])) { $changed++ }
  }
  if ($changed -gt 0) { [void]$applied.Add('tarefas-lite') }
}

function Apply-Visuals([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 2
  Set-Reg 'HKCU:\Control Panel\Desktop' 'MenuShowDelay' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Desktop' 'DragFullWindows' '0' 'String'
  [void]$applied.Add('efeitos-visuais-desempenho')
}

function Apply-BackgroundApps([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 1
  [void]$applied.Add('apps-segundo-plano')
}

function Apply-Transparency([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0
  [void]$applied.Add('transparencia-off')
}

function Apply-GamingCore([System.Collections.ArrayList]$applied) {
  Apply-GameMode $applied
  Apply-GameDvr $applied
  Apply-MmcssGaming $applied
}

function Apply-Windows([System.Collections.ArrayList]$applied) {
  Apply-PowerPlan $applied $true
  Apply-GamingCore $applied
  Apply-ForegroundQos $applied
  Apply-PowerThrottlingOff $applied
  Apply-GpuScheduling $applied
  Apply-NetworkLatency $applied
  Apply-StartupResponsiveness $applied
  Apply-Visuals $applied
  Apply-BackgroundApps $applied
  Apply-Transparency $applied
  Apply-LiteServices $applied
  Apply-LiteTasks $applied
}

function Apply-Mouse([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseSpeed' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseThreshold1' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Mouse' 'MouseThreshold2' '0' 'String'
  [void]$applied.Add('mouse-aceleracao-off')
}

function Apply-Keyboard([System.Collections.ArrayList]$applied) {
  Set-Reg 'HKCU:\Control Panel\Keyboard' 'KeyboardDelay' '0' 'String'
  Set-Reg 'HKCU:\Control Panel\Keyboard' 'KeyboardSpeed' '31' 'String'
  [void]$applied.Add('teclado-repeticao-rapida')
}

try {
  $locked = $mutex.WaitOne(5000)
  if (-not $locked) { throw 'ERR_OPT_BUSY' }
  if (($action -eq 'revert' -or $profile -eq 'level-5') -and -not (Test-Path -LiteralPath $restoreFile)) {
    throw 'ERR_RESTORE_NOT_FOUND'
  }
  Ensure-State
  $stateLoaded = $true

  if ($action -eq 'revert') {
    Restore-All
    Remove-Item -LiteralPath $restoreFile -Force
    @{ revertidos = @('estado-registro', 'plano-energia'); origin = 'measured' } | ConvertTo-Json -Compress
    exit 0
  }
  if ($action -ne 'apply') { throw 'ERR_OPT_ACTION' }

  $applied = New-Object System.Collections.ArrayList
  switch -Regex ($profile) {
    '^input-reduct-mouse$' {
      Apply-Mouse $applied
      break
    }
    '^input-reduct-teclado$' {
      Apply-Keyboard $applied
      break
    }
    '^level-5$' { Restore-All; Remove-Item -LiteralPath $restoreFile -Force; [void]$applied.Add('estado-original-restaurado'); break }
    '^level-4$' { Apply-PowerPlan $applied $false; break }
    '^level-3$' {
      Apply-PowerPlan $applied $false
      Apply-GameMode $applied
      Apply-MmcssGaming $applied
      break
    }
    '^level-2$' {
      Apply-PowerPlan $applied $true
      Apply-GamingCore $applied
      Apply-ForegroundQos $applied
      Apply-PowerThrottlingOff $applied
      Apply-NetworkLatency $applied
      Apply-BackgroundApps $applied
      break
    }
    '^level-1$' { Apply-Windows $applied; Apply-Mouse $applied; Apply-Keyboard $applied; break }
    '^jogo-(cs2|lol|fivem|valorant|fortnite|gta5|rocketleague|apex|dota2|r6|overwatch2|pubg)$' { Apply-GameTuning $applied ($profile -replace '^jogo-', ''); break }
    '^customizado-100$' { Apply-GameMode $applied; break }
    '^customizado-75$' { Apply-GameMode $applied; Apply-GameDvr $applied; break }
    '^(autonomo|customizado-50)$' { Apply-PowerPlan $applied $false; Apply-GamingCore $applied; break }
    '^customizado-25$' { Apply-PowerPlan $applied $true; Apply-GamingCore $applied; Apply-ForegroundQos $applied; Apply-BackgroundApps $applied; Apply-Transparency $applied; break }
    '^(forcado|customizado-0|reduzir-gargalo|boost-seguro)$' { Apply-Windows $applied; break }
    default { throw 'ERR_OPT_PROFILE' }
  }
  if ($profile -ne 'level-5') {
    $script:restore.activeProfiles = @(@($script:restore.activeProfiles) + @($profile) | Select-Object -Unique)
    Save-State
  }
  $activePower = Get-ActivePowerGuid
  $powerVerified = $false
  $powerName = $null
  if ($applied -contains 'plano-energia-alto') {
    $powerVerified = ([string]$script:restore.createdPowerPlan -eq [string]$activePower)
    if ($powerVerified) { $powerName = 'PLF CORE - MAX PERFORMANCE' }
  }
  $restartRecommended = (($applied -contains 'servicos-lite') -or ($applied -contains 'tarefas-lite') -or ($applied -contains 'interface-responsiva'))
  @{
    perfil = $profile
    aplicados = @($applied)
    admin = ([bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
    planoEnergia = $powerName
    desempenhoVerificado = $powerVerified
    reinicioRecomendado = $restartRecommended
    origin = 'measured'
  } | ConvertTo-Json -Compress
} catch {
  $code = [string]$_.Exception.Message
  if ($action -eq 'apply' -and $stateLoaded -and $profile -ne 'level-5') {
    try {
      Restore-All
      Remove-Item -LiteralPath $restoreFile -Force -ErrorAction SilentlyContinue
    } catch {}
  }
  if ($code -notmatch '^ERR_') { $code = 'ERR_OPT_APPLY' }
  Write-Error $code
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
