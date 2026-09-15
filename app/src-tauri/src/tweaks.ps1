$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$stateDir = Join-Path $env:LOCALAPPDATA 'Resync'
$stateFile = Join-Path $stateDir 'tweaks.json'
$mutex = New-Object System.Threading.Mutex($false, 'Local\ResyncTweaks')
$locked = $false

function Reg([string]$path, [string]$name, $on, $off, [string]$kind = 'DWord', [string]$merge = '') {
  return [pscustomobject]@{ path = $path; name = $name; on = $on; off = $off; kind = $kind; merge = $merge }
}

function Merge-Token([string]$atual, [string]$token) {
  $chave = ($token -split '=')[0]
  $tokens = @()
  if ($atual) {
    $tokens = @($atual -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch ("^{0}=" -f [regex]::Escape($chave)) })
  }
  $tokens += $token.TrimEnd(';')
  return (($tokens -join ';') + ';')
}

function Remove-Token([string]$atual, [string]$token) {
  $chave = ($token -split '=')[0]
  $tokens = @()
  if ($atual) {
    $tokens = @($atual -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch ("^{0}=" -f [regex]::Escape($chave)) })
  }
  if ($tokens.Count -eq 0) { return '' }
  return (($tokens -join ';') + ';')
}

function Ajuste([string]$id, [bool]$admin, $registros, $servicos = @(), $tarefas = @(), [string]$especial = '') {
  return [pscustomobject]@{ id = $id; admin = $admin; registros = @($registros); servicos = @($servicos); tarefas = @($tarefas); especial = $especial }
}

$CDM = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
$EDGE = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
$WER = 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting'
$WERPOL = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting'
$AUTOLOG = 'HKLM:\SYSTEM\CurrentControlSet\Control\WMI\AutoLogger'
$INPUTP = 'HKCU:\SOFTWARE\Microsoft\InputPersonalization'
$PRIV = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Privacy'
$LOCPOL = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\LocationAndSensors'
$NVTAREFA = '{B2FE1952-0186-46C3-BAEC-A80AA35AC5B8}'

$Ajustes = @(
  (Ajuste 'anuncio-id-off' $false @(
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' 'Enabled' 0 1)
  )),
  (Ajuste 'experiencias-personalizadas-off' $false @(
    (Reg $PRIV 'TailoredExperiencesWithDiagnosticDataEnabled' 0 1)
  )),
  (Ajuste 'feedback-off' $false @(
    (Reg 'HKCU:\Software\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 0 $null),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Diagnostics\FeedbackNotifications' 'DoNotShowFeedbackNotifications' 1 $null)
  )),
  (Ajuste 'historico-atividades-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'PublishUserActivities' 0 $null),
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' 'UploadUserActivities' 0 $null)
  )),
  (Ajuste 'telemetria-minima' $true @(
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' 'AllowTelemetry' 0 $null)
  )),
  (Ajuste 'digitacao-voz-off' $false @(
    (Reg $INPUTP 'RestrictImplicitTextCollection' 1 0),
    (Reg $INPUTP 'RestrictImplicitInkCollection' 1 0),
    (Reg 'HKCU:\SOFTWARE\Microsoft\InputPersonalization\TrainedDataStore' 'HarvestContacts' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Input\TIPC' 'Enabled' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Speech_OneCore\Settings\OnlineSpeechPrivacy' 'HasAccepted' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Personalization\Settings' 'AcceptedPrivacyPolicy' 0 1),
    (Reg 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppDiagnostics' 'AppDiagnosticsEnabled' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'Start_TrackProgs' 0 1)
  )),
  (Ajuste 'localizacao-off' $true @(
    (Reg $LOCPOL 'DisableLocation' 1 $null),
    (Reg $LOCPOL 'DisableLocationScripting' 1 $null),
    (Reg $LOCPOL 'DisableWindowsLocationProvider' 1 $null),
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\lfsvc\Service\Configuration' 'Status' 0 1),
    (Reg 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location' 'Value' 'Deny' 'Allow' 'String'),
    (Reg $PRIV 'LocationServicesEnabled' 0 1)
  ) @('lfsvc')),
  (Ajuste 'telemetria-edge-off' $true @(
    (Reg $EDGE 'MetricsReportingEnabled' 0 $null),
    (Reg $EDGE 'PersonalizationReportingEnabled' 0 $null),
    (Reg $EDGE 'UserFeedbackAllowed' 0 $null),
    (Reg $EDGE 'Edge3PSerpTelemetryEnabled' 0 $null),
    (Reg $EDGE 'SpotlightExperiencesAndRecommendationsEnabled' 0 $null),
    (Reg $EDGE 'StartupBoostEnabled' 0 $null),
    (Reg $EDGE 'BackgroundModeEnabled' 0 $null)
  )),
  (Ajuste 'relatorio-erros-off' $true @(
    (Reg $WER 'Disabled' 1 0),
    (Reg $WERPOL 'Disabled' 1 $null),
    (Reg $WERPOL 'LoggingDisabled' 1 $null),
    (Reg 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting' 'DontSendAdditionalData' 1 $null)
  ) @('WerSvc', 'wercplsupport')),
  (Ajuste 'autologger-off' $true @(
    (Reg "$AUTOLOG\AutoLogger-Diagtrack-Listener" 'Start' 0 1),
    (Reg "$AUTOLOG\SQMLogger" 'Start' 0 1)
  )),
  (Ajuste 'telemetria-driver-off' $true @() @('NvTelemetryContainer') @(
    "\NvTmRep_$NVTAREFA", "\NvTmRepOnLogon_$NVTAREFA", "\NvTmMon_$NVTAREFA"
  )),
  (Ajuste 'sugestoes-menu-off' $false @(
    (Reg $CDM 'SystemPaneSuggestionsEnabled' 0 1),
    (Reg $CDM 'SilentInstalledAppsEnabled' 0 1),
    (Reg $CDM 'SoftLandingEnabled' 0 1),
    (Reg $CDM 'SubscribedContent-338388Enabled' 0 1),
    (Reg $CDM 'SubscribedContent-338389Enabled' 0 1),
    (Reg $CDM 'SubscribedContent-353694Enabled' 0 1),
    (Reg $CDM 'SubscribedContent-353696Enabled' 0 1),
    (Reg $CDM 'PreInstalledAppsEnabled' 0 1),
    (Reg $CDM 'OemPreInstalledAppsEnabled' 0 1),
    (Reg $CDM 'RotatingLockScreenOverlayEnabled' 0 1)
  )),
  (Ajuste 'copilot-off' $false @(
    (Reg 'HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot' 'TurnOffWindowsCopilot' 1 $null),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ShowCopilotButton' 0 1)
  )),
  (Ajuste 'widgets-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh' 'AllowNewsAndInterests' 0 $null)
  )),
  (Ajuste 'busca-bing-off' $false @(
    (Reg 'HKCU:\Software\Policies\Microsoft\Windows\Explorer' 'DisableSearchBoxSuggestions' 1 $null),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'BingSearchEnabled' 0 1)
  )),
  (Ajuste 'visual-cru' $false @(
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewAlphaSelect' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ListviewShadow' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'AlwaysHibernateThumbnails' 0 1)
  ) @() @() 'sem-animacao'),
  (Ajuste 'miniaturas-off' $false @(
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'IconsOnly' 1 0),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'ExtendedUIHoverTime' 30000 $null)
  )),
  (Ajuste 'fonte-crua' $false @(
    (Reg 'HKCU:\Control Panel\Desktop' 'FontSmoothing' '0' '2' 'String')
  )),
  (Ajuste 'gamebar-off' $false @(
    (Reg 'HKCU:\Software\Microsoft\GameBar' 'ShowStartupPanel' 0 1),
    (Reg 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0 1)
  )),
  (Ajuste 'tela-cheia-classica' $false @(
    (Reg 'HKCU:\System\GameConfigStore' 'GameDVR_FSEBehaviorMode' 2 0),
    (Reg 'HKCU:\System\GameConfigStore' 'GameDVR_HonorUserFSEBehaviorMode' 1 0),
    (Reg 'HKCU:\System\GameConfigStore' 'GameDVR_DXGIHonorFSEWindowsCompatible' 1 0),
    (Reg 'HKCU:\System\GameConfigStore' 'GameDVR_EFSEFeatureFlags' 0 $null)
  )),
  (Ajuste 'flip-model-on' $false @(
    (Reg 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' 'DirectXUserGlobalSettings' 'SwapEffectUpgradeEnable=1' $null 'String' 'token')
  )),
  (Ajuste 'mpo-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Microsoft\Windows\Dwm' 'OverlayTestMode' 5 $null)
  )),
  (Ajuste 'teclas-aderencia-off' $false @(
    (Reg 'HKCU:\Control Panel\Accessibility\StickyKeys' 'Flags' '506' '510' 'String')
  )),
  (Ajuste 'delivery-p2p-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' 'DODownloadMode' 0 $null),
    (Reg 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\DeliveryOptimization\Config' 'DODownloadMode' 0 $null)
  )),
  (Ajuste 'llmnr-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' 'EnableMulticast' 0 $null)
  )),
  (Ajuste 'netbios-off' $true @() @() @() 'netbios'),
  (Ajuste 'dns-rapido' $true @() @() @() 'dns'),
  (Ajuste 'tarefas-diagnostico-off' $true @() @() @(
    '\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector',
    '\Microsoft\Windows\Windows Error Reporting\QueueReporting',
    '\Microsoft\Windows\Maintenance\WinSAT',
    '\Microsoft\Windows\Feedback\Siuf\DmClient',
    '\Microsoft\Windows\Feedback\Siuf\DmClientOnScenarioDownload',
    '\Microsoft\Windows\Autochk\Proxy'
  )),
  (Ajuste 'nic-energia-off' $true @() @() @() 'nic-power'),
  (Ajuste 'hibernacao-off' $true @() @() @() 'hibernacao'),
  (Ajuste 'dump-minidump' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' 'CrashDumpEnabled' 3 7)
  )),
  (Ajuste 'fth-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Microsoft\FTH' 'Enabled' 0 1)
  )),
  (Ajuste 'indexacao-off' $true @() @('WSearch')),
  (Ajuste 'spooler-off' $true @() @('Spooler', 'PrintNotify')),
  (Ajuste 'acesso-remoto-off' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Remote Assistance' 'fAllowToGetHelp' 0 1),
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections' 1 0)
  ) @('TermService', 'UmRdpService', 'SessionEnv', 'RemoteRegistry')),
  (Ajuste 'xbox-servicos-off' $true @() @('XblAuthManager', 'XblGameSave', 'XboxNetApiSvc', 'XboxGipSvc')),
  (Ajuste 'manutencao-automatica-off' $true @(
    (Reg 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule\Maintenance' 'MaintenanceDisabled' 1 $null)
  )),
  (Ajuste 'ultimo-acesso-off' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' 'NtfsDisableLastAccessUpdate' 1 $null)
  )),
  # 38 = 0x26: quantum curto, variável, prioridade alta para o primeiro plano —
  # é o que o preset "Programas" do Windows grava. Fábrica é 2.
  (Ajuste 'prioridade-primeiro-plano' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\PriorityControl' 'Win32PrioritySeparation' 38 2)
  )),
  (Ajuste 'msconfig-limites-off' $true @() @() @() 'msconfig'),
  (Ajuste 'rsc-off' $true @() @() @() 'rsc'),
  (Ajuste 'vbs-off' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard\Scenarios\HypervisorEnforcedCodeIntegrity' 'Enabled' 0 1)
  ))
)

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Load-State {
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  if (Test-Path -LiteralPath $stateFile) {
    $script:estado = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  } else {
    $script:estado = [pscustomobject]@{ version = 1; ajustes = [pscustomobject]@{} }
  }
}

function Save-State {
  $tmp = Join-Path $stateDir ("tweaks-{0}-{1}.tmp" -f $PID, [guid]::NewGuid().ToString('N'))
  $script:estado | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $stateFile -Force
}

function Get-RegAtual([string]$path, [string]$name) {
  $ausente = [pscustomobject]@{ existed = $false; value = $null; kind = 'String' }
  try {
    if (-not (Test-Path -LiteralPath $path)) { return $ausente }
    $key = Get-Item -LiteralPath $path -ErrorAction Stop
    if (@($key.GetValueNames()) -notcontains $name) { return $ausente }
    return [pscustomobject]@{
      existed = $true
      value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      kind = [string]$key.GetValueKind($name)
    }
  } catch {
    return $ausente
  }
}

# O MSCONFIG grava esses dois na entrada de boot. "Número de processadores" só
# LIMITA núcleos — o Windows já usa todos por padrão — e "memória máxima" só corta
# RAM. Aqui o ajuste é apagar os dois, não gravá-los.
$BcdLimites = @('numproc', 'truncatememory')

function Get-BcdLimites {
  try {
    $saida = & bcdedit.exe /enum '{current}' 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $mapa = @{}
    foreach ($linha in @($saida)) {
      foreach ($nome in $BcdLimites) {
        if ([string]$linha -match "^\s*$nome\s+(\S+)\s*$") { $mapa[$nome] = $Matches[1] }
      }
    }
    return $mapa
  } catch {
    return $null
  }
}

function Get-NetbiosInterfaces {
  $base = 'HKLM:\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces'
  if (-not (Test-Path -LiteralPath $base)) { return @() }
  return @(Get-ChildItem -LiteralPath $base -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like 'Tcpip_*' })
}

$DnsRapido = @('1.1.1.1', '1.0.0.1')

$PrefMaskPath = 'HKCU:\Control Panel\Desktop'
$PrefMaskName = 'UserPreferencesMask'
$PrefMaskBits = @(
  [pscustomobject]@{ byte = 0; bit = 0x02 },
  [pscustomobject]@{ byte = 0; bit = 0x04 },
  [pscustomobject]@{ byte = 0; bit = 0x08 },
  [pscustomobject]@{ byte = 0; bit = 0x10 },
  [pscustomobject]@{ byte = 1; bit = 0x02 },
  [pscustomobject]@{ byte = 1; bit = 0x04 },
  [pscustomobject]@{ byte = 1; bit = 0x08 },
  [pscustomobject]@{ byte = 1; bit = 0x10 },
  [pscustomobject]@{ byte = 1; bit = 0x20 }
)

function Get-PrefMask {
  try {
    $valor = Get-ItemPropertyValue -LiteralPath $PrefMaskPath -Name $PrefMaskName -ErrorAction Stop
    if ($valor -is [byte[]] -and $valor.Length -ge 2) { return $valor }
  } catch {}
  return $null
}

function Test-PrefMaskCru {
  $mask = Get-PrefMask
  if ($null -eq $mask) { return $false }
  foreach ($alvo in $PrefMaskBits) {
    if ($mask.Length -le $alvo.byte) { continue }
    if (($mask[$alvo.byte] -band $alvo.bit) -ne 0) { return $false }
  }
  return $true
}

function Set-PrefMaskCru([bool]$ligar, $baseline) {
  if (-not $ligar) {
    $anterior = @($baseline | Where-Object { [string]$_.key -eq 'mask' } | Select-Object -First 1)
    if ($anterior.Count -gt 0 -and $anterior[0].value) {
      $bytes = [byte[]]([Convert]::FromBase64String([string]$anterior[0].value))
      New-ItemProperty -LiteralPath $PrefMaskPath -Name $PrefMaskName -Value $bytes -PropertyType Binary -Force | Out-Null
    }
    return
  }
  $mask = Get-PrefMask
  if ($null -eq $mask) { return }
  $novo = [byte[]]::new($mask.Length)
  [Array]::Copy($mask, $novo, $mask.Length)
  foreach ($alvo in $PrefMaskBits) {
    if ($novo.Length -le $alvo.byte) { continue }
    $novo[$alvo.byte] = [byte](($novo[$alvo.byte] -band (-bnot $alvo.bit)) -band 0xFF)
  }
  New-ItemProperty -LiteralPath $PrefMaskPath -Name $PrefMaskName -Value $novo -PropertyType Binary -Force | Out-Null
}

function Get-DnsAdapters {
  try {
    return @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' })
  } catch { return @() }
}

function Get-PowerManagedAdapters {
  try {
    return @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -ne 'Not Present' })
  } catch { return @() }
}

# RSC junta segmentos TCP antes de subir a pilha: economiza CPU e adiciona
# latência. Só adaptador físico interessa — o switch virtual não carrega o jogo.
function Get-RscAdapters {
  try {
    return @(Get-NetAdapterRsc -ErrorAction Stop | Where-Object { $_.Name -in (Get-NetAdapter -Physical -ErrorAction SilentlyContinue).Name })
  } catch { return @() }
}

function Test-HibernacaoOff {
  try {
    return ([int](Get-ItemPropertyValue -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -Name 'HibernateEnabled' -ErrorAction Stop) -eq 0)
  } catch { return $false }
}

function Test-Especial([string]$especial) {
  switch ($especial) {
    'hibernacao' { return (Test-HibernacaoOff) }
    'msconfig' {
      $limites = Get-BcdLimites
      # Sem leitura do BCD não dá pra afirmar nada: fica como "não aplicado".
      if ($null -eq $limites) { return $false }
      return ($limites.Count -eq 0)
    }
    'rsc' {
      $adaptadores = Get-RscAdapters
      if ($adaptadores.Count -eq 0) { return $false }
      foreach ($a in $adaptadores) {
        if ([bool]$a.IPv4Enabled -or [bool]$a.IPv6Enabled) { return $false }
      }
      return $true
    }
    'sem-animacao' { return (Test-PrefMaskCru) }
    'netbios' {
      $interfaces = Get-NetbiosInterfaces
      if ($interfaces.Count -eq 0) { return $false }
      foreach ($item in $interfaces) {
        try {
          if ([int](Get-ItemPropertyValue -LiteralPath $item.PSPath -Name 'NetbiosOptions' -ErrorAction Stop) -ne 2) { return $false }
        } catch { return $false }
      }
      return $true
    }
    'nic-power' {
      $adaptadores = Get-PowerManagedAdapters
      if ($adaptadores.Count -eq 0) { return $false }
      foreach ($adaptador in $adaptadores) {
        try {
          $pm = Get-NetAdapterPowerManagement -Name $adaptador.Name -ErrorAction Stop
          if ([string]$pm.AllowComputerToTurnOffDevice -eq 'Enabled') { return $false }
        } catch {}
      }
      return $true
    }
    'dns' {
      $adaptadores = Get-DnsAdapters
      if ($adaptadores.Count -eq 0) { return $false }
      foreach ($adaptador in $adaptadores) {
        try {
          $atual = @((Get-DnsClientServerAddress -InterfaceIndex $adaptador.ifIndex -AddressFamily IPv4 -ErrorAction Stop).ServerAddresses)
          if ($atual.Count -eq 0 -or $atual[0] -ne $DnsRapido[0]) { return $false }
        } catch { return $false }
      }
      return $true
    }
  }
  return $false
}

function Test-Ligado($ajuste) {
  if ($ajuste.especial -and -not (Test-Especial $ajuste.especial)) { return $false }
  if ($ajuste.especial -and $ajuste.registros.Count -eq 0) { return $true }
  $temAlgo = $false
  foreach ($reg in $ajuste.registros) {
    $temAlgo = $true
    $atual = Get-RegAtual $reg.path $reg.name
    if (-not $atual.existed) { return $false }
    if ($reg.merge -eq 'token') {
      if ([string]$atual.value -notmatch ([regex]::Escape([string]$reg.on))) { return $false }
    } elseif ([string]$atual.value -ne [string]$reg.on) { return $false }
  }
  foreach ($nome in $ajuste.servicos) {
    $svc = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $nome) -ErrorAction SilentlyContinue
    if ($null -eq $svc) { continue }
    $temAlgo = $true
    if ([string]$svc.StartMode -ne 'Disabled') { return $false }
  }
  foreach ($caminho in $ajuste.tarefas) {
    $nome = Split-Path -Leaf $caminho
    $pasta = Split-Path -Parent $caminho
    if (-not $pasta.EndsWith('\')) { $pasta = "$pasta\" }
    $task = Get-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue
    if ($null -eq $task) { continue }
    $temAlgo = $true
    if ([string]$task.State -ne 'Disabled') { return $false }
  }
  return $temAlgo
}

function Save-Baseline($ajuste) {
  $nomeId = [string]$ajuste.id
  if ($script:estado.ajustes.PSObject.Properties[$nomeId]) { return }
  $registros = @()
  foreach ($reg in $ajuste.registros) {
    $atual = Get-RegAtual $reg.path $reg.name
    $registros += [pscustomobject]@{ path = $reg.path; name = $reg.name; existed = $atual.existed; value = $atual.value; kind = $atual.kind }
  }
  $servicos = @()
  foreach ($nome in $ajuste.servicos) {
    $svc = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $nome) -ErrorAction SilentlyContinue
    if ($svc) {
      $servicos += [pscustomobject]@{ name = $nome; startMode = [string]$svc.StartMode; wasRunning = ([string]$svc.State -eq 'Running') }
    }
  }
  $tarefas = @()
  foreach ($caminho in $ajuste.tarefas) {
    $nome = Split-Path -Leaf $caminho
    $pasta = Split-Path -Parent $caminho
    if (-not $pasta.EndsWith('\')) { $pasta = "$pasta\" }
    $task = Get-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue
    if ($task) {
      $tarefas += [pscustomobject]@{ path = $pasta; name = $nome; wasEnabled = ([string]$task.State -ne 'Disabled') }
    }
  }
  $especial = @()
  if ($ajuste.especial -eq 'netbios') {
    foreach ($item in (Get-NetbiosInterfaces)) {
      $valor = $null
      try { $valor = [int](Get-ItemPropertyValue -LiteralPath $item.PSPath -Name 'NetbiosOptions' -ErrorAction Stop) } catch {}
      $especial += [pscustomobject]@{ key = [string]$item.PSChildName; value = $valor }
    }
  }
  if ($ajuste.especial -eq 'nic-power') {
    foreach ($adaptador in (Get-PowerManagedAdapters)) {
      try {
        $pm = Get-NetAdapterPowerManagement -Name $adaptador.Name -ErrorAction Stop
        $especial += [pscustomobject]@{ key = [string]$adaptador.Name; value = [string]$pm.AllowComputerToTurnOffDevice }
      } catch {}
    }
  }
  if ($ajuste.especial -eq 'rsc') {
    foreach ($a in (Get-RscAdapters)) {
      $especial += [pscustomobject]@{ key = [string]$a.Name; value = ("{0},{1}" -f [int][bool]$a.IPv4Enabled, [int][bool]$a.IPv6Enabled) }
    }
  }
  if ($ajuste.especial -eq 'msconfig') {
    $limites = Get-BcdLimites
    if ($null -ne $limites) {
      foreach ($nome in $BcdLimites) {
        if ($limites.ContainsKey($nome)) {
          $especial += [pscustomobject]@{ key = $nome; value = [string]$limites[$nome] }
        }
      }
    }
  }
  if ($ajuste.especial -eq 'sem-animacao') {
    $mask = Get-PrefMask
    if ($null -ne $mask) {
      $especial += [pscustomobject]@{ key = 'mask'; value = [Convert]::ToBase64String($mask) }
    }
  }
  if ($ajuste.especial -eq 'dns') {
    foreach ($adaptador in (Get-DnsAdapters)) {
      try {
        $atual = @((Get-DnsClientServerAddress -InterfaceIndex $adaptador.ifIndex -AddressFamily IPv4 -ErrorAction Stop).ServerAddresses)
        $especial += [pscustomobject]@{ key = [string]$adaptador.ifIndex; value = ($atual -join ',') }
      } catch {}
    }
  }
  $script:estado.ajustes | Add-Member -NotePropertyName $nomeId -NotePropertyValue ([pscustomobject]@{
    registros = $registros; servicos = $servicos; tarefas = $tarefas; especial = $especial
  }) -Force
  Save-State
}

function Set-RegValor([string]$path, [string]$name, $value, [string]$kind) {
  if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -Value $value -PropertyType $kind -Force | Out-Null
}

function Set-TaskState([string]$caminho, [bool]$habilitar) {
  $nome = Split-Path -Leaf $caminho
  $pasta = Split-Path -Parent $caminho
  if (-not $pasta.EndsWith('\')) { $pasta = "$pasta\" }
  if (-not (Get-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue)) { return }
  if ($habilitar) {
    Enable-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue | Out-Null
  } else {
    Disable-ScheduledTask -TaskPath $pasta -TaskName $nome -ErrorAction SilentlyContinue | Out-Null
  }
}

function Apply-Especial([string]$especial, [bool]$ligar, $baseline) {
  switch ($especial) {
    'hibernacao' {
      if ($ligar) { powercfg /hibernate off 2>$null | Out-Null } else { powercfg /hibernate on 2>$null | Out-Null }
    }
    'msconfig' {
      if ($ligar) {
        foreach ($nome in $BcdLimites) {
          & bcdedit.exe /deletevalue '{current}' $nome 2>$null | Out-Null
        }
      } else {
        foreach ($entry in @($baseline)) {
          $nome = [string]$entry.key
          if ($BcdLimites -notcontains $nome) { continue }
          & bcdedit.exe /set '{current}' $nome ([string]$entry.value) 2>$null | Out-Null
        }
      }
    }
    'rsc' {
      $mapa = @{}
      foreach ($entry in @($baseline)) { $mapa[[string]$entry.key] = [string]$entry.value }
      foreach ($a in (Get-RscAdapters)) {
        try {
          if ($ligar) {
            Set-NetAdapterRsc -Name $a.Name -IPv4Enabled $false -IPv6Enabled $false -NoRestart -ErrorAction Stop | Out-Null
          } else {
            $partes = ([string]$mapa[[string]$a.Name] -split ',')
            $v4 = ($partes.Count -lt 1 -or $partes[0] -ne '0')
            $v6 = ($partes.Count -lt 2 -or $partes[1] -ne '0')
            Set-NetAdapterRsc -Name $a.Name -IPv4Enabled $v4 -IPv6Enabled $v6 -NoRestart -ErrorAction Stop | Out-Null
          }
        } catch {}
      }
    }
    'sem-animacao' { Set-PrefMaskCru $ligar $baseline }
    'netbios' {
      if ($ligar) {
        foreach ($item in (Get-NetbiosInterfaces)) {
          New-ItemProperty -LiteralPath $item.PSPath -Name 'NetbiosOptions' -Value 2 -PropertyType DWord -Force | Out-Null
        }
      } else {
        $mapa = @{}
        foreach ($entry in @($baseline)) { $mapa[[string]$entry.key] = $entry.value }
        foreach ($item in (Get-NetbiosInterfaces)) {
          $valor = 0
          if ($mapa.ContainsKey([string]$item.PSChildName) -and $null -ne $mapa[[string]$item.PSChildName]) {
            $valor = [int]$mapa[[string]$item.PSChildName]
          }
          New-ItemProperty -LiteralPath $item.PSPath -Name 'NetbiosOptions' -Value $valor -PropertyType DWord -Force | Out-Null
        }
      }
    }
    'nic-power' {
      $mapa = @{}
      foreach ($entry in @($baseline)) { $mapa[[string]$entry.key] = [string]$entry.value }
      foreach ($adaptador in (Get-PowerManagedAdapters)) {
        try {
          if ($ligar) {
            Disable-NetAdapterPowerManagement -Name $adaptador.Name -NoRestart -ErrorAction Stop | Out-Null
          } elseif (-not $mapa.ContainsKey($adaptador.Name) -or $mapa[$adaptador.Name] -eq 'Enabled') {
            Enable-NetAdapterPowerManagement -Name $adaptador.Name -NoRestart -ErrorAction Stop | Out-Null
          }
        } catch {}
      }
    }
    'dns' {
      $mapa = @{}
      foreach ($entry in @($baseline)) { $mapa[[string]$entry.key] = [string]$entry.value }
      foreach ($adaptador in (Get-DnsAdapters)) {
        try {
          if ($ligar) {
            Set-DnsClientServerAddress -InterfaceIndex $adaptador.ifIndex -ServerAddresses $DnsRapido -ErrorAction Stop | Out-Null
          } else {
            $anterior = [string]$mapa[[string]$adaptador.ifIndex]
            if ($anterior) {
              Set-DnsClientServerAddress -InterfaceIndex $adaptador.ifIndex -ServerAddresses ($anterior -split ',') -ErrorAction Stop | Out-Null
            } else {
              Set-DnsClientServerAddress -InterfaceIndex $adaptador.ifIndex -ResetServerAddresses -ErrorAction Stop | Out-Null
            }
          }
        } catch {}
      }
      Clear-DnsClientCache -ErrorAction SilentlyContinue
    }
  }
}

function Apply-On($ajuste) {
  Save-Baseline $ajuste
  if ($ajuste.especial) {
    $baseline = $null
    if ($script:estado.ajustes.PSObject.Properties[[string]$ajuste.id]) { $baseline = $script:estado.ajustes.($ajuste.id).especial }
    Apply-Especial $ajuste.especial $true $baseline
  }
  foreach ($reg in $ajuste.registros) {
    if ($reg.merge -eq 'token') {
      $atual = Get-RegAtual $reg.path $reg.name
      Set-RegValor $reg.path $reg.name (Merge-Token ([string]$atual.value) ([string]$reg.on)) $reg.kind
    } else {
      Set-RegValor $reg.path $reg.name $reg.on $reg.kind
    }
  }
  foreach ($nome in $ajuste.servicos) {
    $svc = Get-Service -Name $nome -ErrorAction SilentlyContinue
    if ($null -eq $svc) { continue }
    if ($svc.Status -eq 'Running' -and $svc.CanStop) { Stop-Service -Name $nome -Force -ErrorAction SilentlyContinue }
    Set-Service -Name $nome -StartupType Disabled -ErrorAction SilentlyContinue
  }
  foreach ($caminho in $ajuste.tarefas) { Set-TaskState $caminho $false }
}

function Apply-Off($ajuste) {
  $nomeId = [string]$ajuste.id
  $baseline = $null
  if ($script:estado.ajustes.PSObject.Properties[$nomeId]) { $baseline = $script:estado.ajustes.$nomeId }

  if ($ajuste.especial) {
    $dados = if ($baseline) { $baseline.especial } else { @() }
    Apply-Especial $ajuste.especial $false $dados
  }

  if ($baseline) {
    foreach ($entry in @($baseline.registros)) {
      if ([bool]$entry.existed) {
        Set-RegValor ([string]$entry.path) ([string]$entry.name) $entry.value ([string]$entry.kind)
      } elseif (Test-Path -LiteralPath ([string]$entry.path)) {
        Remove-ItemProperty -LiteralPath ([string]$entry.path) -Name ([string]$entry.name) -ErrorAction SilentlyContinue
      }
    }
    foreach ($entry in @($baseline.servicos)) {
      $startup = switch ([string]$entry.startMode) {
        'Auto' { 'Automatic' }
        'Disabled' { 'Disabled' }
        default { 'Manual' }
      }
      Set-Service -Name ([string]$entry.name) -StartupType $startup -ErrorAction SilentlyContinue
      if ([bool]$entry.wasRunning) { Start-Service -Name ([string]$entry.name) -ErrorAction SilentlyContinue }
    }
    foreach ($entry in @($baseline.tarefas)) {
      Set-TaskState (("{0}{1}" -f [string]$entry.path, [string]$entry.name)) ([bool]$entry.wasEnabled)
    }
  } else {
    foreach ($reg in $ajuste.registros) {
      if ($reg.merge -eq 'token') {
        $atual = Get-RegAtual $reg.path $reg.name
        $restante = Remove-Token ([string]$atual.value) ([string]$reg.on)
        if ($restante) { Set-RegValor $reg.path $reg.name $restante $reg.kind }
        elseif (Test-Path -LiteralPath $reg.path) { Remove-ItemProperty -LiteralPath $reg.path -Name $reg.name -ErrorAction SilentlyContinue }
      } elseif ($null -eq $reg.off) {
        if (Test-Path -LiteralPath $reg.path) { Remove-ItemProperty -LiteralPath $reg.path -Name $reg.name -ErrorAction SilentlyContinue }
      } else {
        Set-RegValor $reg.path $reg.name $reg.off $reg.kind
      }
    }
    foreach ($nome in $ajuste.servicos) {
      Set-Service -Name $nome -StartupType Manual -ErrorAction SilentlyContinue
    }
    foreach ($caminho in $ajuste.tarefas) { Set-TaskState $caminho $true }
  }

  if ($baseline) {
    $script:estado.ajustes.PSObject.Properties.Remove($nomeId)
    Save-State
  }
}

try {
  $locked = $mutex.WaitOne(5000)
  if (-not $locked) { throw 'ERR_TWEAKS_BUSY' }
  Load-State

  $acao = [string]$env:RESYNC_TWEAKS_ACTION

  if ($acao -eq 'scan') {
    $itens = foreach ($ajuste in $Ajustes) {
      [pscustomobject]@{ id = $ajuste.id; ligado = (Test-Ligado $ajuste); precisaAdmin = [bool]$ajuste.admin }
    }
    [pscustomobject]@{ items = @($itens); admin = (Test-IsAdmin); origin = 'measured' } | ConvertTo-Json -Depth 4 -Compress
    exit 0
  }

  if ($acao -eq 'on' -or $acao -eq 'off') {
    $id = [string]$env:RESYNC_TWEAKS_ID
    $ajuste = $Ajustes | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if ($null -eq $ajuste) { throw 'ERR_TWEAK_NOT_FOUND' }
    if ($ajuste.admin -and -not (Test-IsAdmin)) { throw 'ERR_TWEAK_ADMIN' }
    if ($acao -eq 'on') { Apply-On $ajuste } else { Apply-Off $ajuste }
    [pscustomobject]@{ id = $id; ligado = (Test-Ligado $ajuste); origin = 'measured' } | ConvertTo-Json -Compress
    exit 0
  }

  throw 'ERR_TWEAKS_ACTION'
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
