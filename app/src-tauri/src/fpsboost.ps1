$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$stateDir = Join-Path $env:LOCALAPPDATA 'PLFCore'
$stateFile = Join-Path $stateDir 'fpsboost.json'
$mutex = New-Object System.Threading.Mutex($false, 'Local\PLFCoreFpsBoost')
$locked = $false

function Reg([string]$path, [string]$name, $on, $off, [string]$kind = 'DWord', [string]$cmp = 'eq') {
  return [pscustomobject]@{ path = $path; name = $name; on = $on; off = $off; kind = $kind; cmp = $cmp }
}

function Ajuste([string]$id, [bool]$admin, $registros, $servicos = @(), [string]$especial = '', $disponivel = $true, $detalhe = $null) {
  return [pscustomobject]@{
    id = $id; admin = $admin; registros = @($registros); servicos = @($servicos)
    especial = $especial; disponivel = [bool]$disponivel; detalhe = $detalhe
  }
}

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
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

# DWord volta como Int32 com sinal: 0xFFFFFFFF vira -1 e quebra comparação de limiar.
function ConvertTo-UInt32($valor) {
  $n = [int64]$valor
  if ($n -lt 0) { $n = $n + 4294967296 }
  return $n
}

function Test-SystemDriveIsSolid {
  try {
    $particao = Get-Partition -DriveLetter ([string]$env:SystemDrive)[0] -ErrorAction Stop
    $disco = Get-PhysicalDisk -ErrorAction Stop | Where-Object { $_.DeviceId -eq [string]$particao.DiskNumber } | Select-Object -First 1
    if ($null -eq $disco) { return $false }
    return ([string]$disco.MediaType -eq 'SSD' -or [string]$disco.BusType -eq 'NVMe' -or [int]$disco.BusType -eq 17)
  } catch { return $false }
}

function Get-RotaAtiva {
  try {
    $indice = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
      Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1 -ExpandProperty InterfaceIndex
    $adaptador = Get-NetAdapter -InterfaceIndex $indice -ErrorAction Stop
    $guid = [string]$adaptador.InterfaceGuid
    if ($guid -match '^\{[0-9A-Fa-f-]{36}\}$') {
      return [pscustomobject]@{ guid = $guid; nome = [string]$adaptador.Name }
    }
  } catch {}
  return $null
}

$IDLE_SUB = '54533251-82be-4824-96c1-47b60b740d00'
$IDLE_SET = '5d76a2ca-e8c0-402f-a133-2158492d58ad'

function Get-PlanoAtivo {
  try {
    $texto = (@(& powercfg.exe /getactivescheme 2>$null) -join ' ')
    if ($texto -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
      $guid = $Matches[1]
      $nome = ''
      if ($texto -match '\(([^)]+)\)\s*$') { $nome = $Matches[1].Trim() }
      return [pscustomobject]@{ guid = $guid; nome = $nome }
    }
  } catch {}
  return $null
}

# "Desabilitar ociosidade do processador" é configuração oculta: o powercfg /query
# não a imprime na maioria das máquinas. O índice real fica no esquema ativo, no
# registro; ausente = padrão de fábrica (0 = ociosidade permitida).
function Get-IdleAcIndex {
  $plano = Get-PlanoAtivo
  if ($null -eq $plano) { return $null }
  $atual = Get-RegAtual "HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes\$($plano.guid)\$IDLE_SUB\$IDLE_SET" 'ACSettingIndex'
  if ($atual.existed) { return [int]$atual.value }
  $hexes = @()
  try {
    foreach ($linha in @(& powercfg.exe /query SCHEME_CURRENT SUB_PROCESSOR $IDLE_SET 2>$null)) {
      if ([string]$linha -match '0x([0-9A-Fa-f]+)\s*$') { $hexes += [Convert]::ToInt64($Matches[1], 16) }
    }
  } catch {}
  # mínimo, máximo, incremento, índice CA, índice CC: o CA é o penúltimo em
  # qualquer idioma — o rótulo muda, a ordem não.
  if ($hexes.Count -ge 2) { return [int]$hexes[$hexes.Count - 2] }
  return 0
}

$DiscoNomes = @('EnableHIPM', 'EnableDIPM', 'EnableHDDParking', 'IoLatencyCap')
$script:discoAlvos = $null

# Só onde o valor JÁ existe: criar essas chaves em driver que não as usa não
# desliga nada e vira lixo no registro. A descoberta é cara (~700 serviços), o
# valor não — por isso o cache guarda os caminhos, nunca o conteúdo.
function Get-DiscoAlvos {
  if ($null -ne $script:discoAlvos) { return $script:discoAlvos }
  $itens = @()
  foreach ($svc in @(Get-ChildItem -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services' -ErrorAction SilentlyContinue)) {
    foreach ($sub in @('Parameters', 'Parameters\Device')) {
      $key = Get-Item -LiteralPath (Join-Path $svc.PSPath $sub) -ErrorAction SilentlyContinue
      if ($null -eq $key) { continue }
      $nomes = @($key.GetValueNames())
      foreach ($nome in $DiscoNomes) {
        if ($nomes -contains $nome) {
          $itens += [pscustomobject]@{ path = [string]$key.PSPath; name = $nome }
        }
      }
    }
  }
  $script:discoAlvos = @($itens)
  return $script:discoAlvos
}

$script:storAlvos = $null

# A árvore Enum inteira é lenta demais: só PCI, com profundidade fixa até
# <VEN_*>\<instancia>\Device Parameters\StorPort (4 níveis abaixo de PCI).
function Get-StorPortAlvos {
  if ($null -ne $script:storAlvos) { return $script:storAlvos }
  $itens = @()
  try {
    $itens = @(Get-ChildItem -Path 'HKLM:\SYSTEM\CurrentControlSet\Enum\PCI' -Recurse -Depth 3 -ErrorAction SilentlyContinue |
      Where-Object { $_.PSChildName -eq 'StorPort' } |
      ForEach-Object { [string]$_.PSPath })
  } catch {}
  $script:storAlvos = @($itens)
  return $script:storAlvos
}

function Get-StorPortContagem {
  $alvos = Get-StorPortAlvos
  $zero = 0
  $outro = 0
  foreach ($path in $alvos) {
    $atual = Get-RegAtual $path 'EnableIdlePowerManagement'
    if (-not $atual.existed) { continue }
    if ([int]$atual.value -eq 0) { $zero++ } else { $outro++ }
  }
  return [pscustomobject]@{ total = $alvos.Count; zero = $zero; outro = $outro }
}

# A varredura de drivers custa segundos: só o scan precisa do detalhe, o toggle não.
$eScan = ([string]$env:PLFCORE_FPSBOOST_ACTION -eq 'scan')

$ramBytes = 0
try { $ramBytes = [double](Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory } catch {}
# O firmware reserva um naco da RAM, então o total visível fica logo abaixo do
# nominal: 32 GB reais reportam ~31,9. Arredondar pra cima devolve o nominal.
$ramGb = 0
if ($ramBytes -gt 0) { $ramGb = [int][math]::Ceiling($ramBytes / 1GB) }
$ramKb = [int]($ramGb * 1024 * 1024)
$discoSolido = Test-SystemDriveIsSolid
$rotaAtiva = Get-RotaAtiva
$planoAtivo = Get-PlanoAtivo
$temNvidia = Test-Path -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm'

$MMCSS = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
$MMGAMES = "$MMCSS\Tasks\Games"
$GCS = 'HKCU:\System\GameConfigStore'
$GAMEBAR = 'HKCU:\Software\Microsoft\GameBar'
$GRAPH = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers'
$POWER = 'HKLM:\SYSTEM\CurrentControlSet\Control\Power'
$MEMMGR = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management'
$CTRL = 'HKLM:\SYSTEM\CurrentControlSet\Control'
$DESKTOP = 'HKCU:\Control Panel\Desktop'
$MOUSE = 'HKCU:\Control Panel\Mouse'
$ADVANCED = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$ACESSO = 'HKCU:\Control Panel\Accessibility'

# Curva de aceleração linear: cada ponto da entrada vale exatamente um ponto na
# saída, sem ganho progressivo. 5 pontos de 8 bytes (fixo 16.16 little-endian).
$CurvaX = [byte[]]@(
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xC0, 0xCC, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x80, 0x99, 0x19, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x40, 0x66, 0x26, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x33, 0x33, 0x00, 0x00, 0x00, 0x00, 0x00
)
$CurvaY = [byte[]]@(
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x38, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xA8, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00
)

$RegsPreempcao = @(
  (Reg "$GRAPH\Scheduler" 'EnablePreemption' 0 $null)
)
if ($temNvidia) {
  # O driver da NVIDIA lê estas duas na própria chave de serviço, não no agendador.
  $RegsPreempcao += (Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm' 'DisablePreemption' 1 $null)
  $RegsPreempcao += (Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\nvlddmkm' 'DisableCudaContextPreemption' 1 $null)
}

$RegsTcp = @()
if ($null -ne $rotaAtiva) {
  $iface = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\$($rotaAtiva.guid)"
  $RegsTcp = @(
    (Reg $iface 'TcpAckFrequency' 1 $null),
    (Reg $iface 'TCPNoDelay' 1 $null)
  )
}

$Ajustes = @(
  (Ajuste 'mmcss-perfil-jogo' $true @(
    (Reg $MMCSS 'SystemResponsiveness' 0 20),
    (Reg $MMCSS 'NetworkThrottlingIndex' -1 10),
    (Reg $MMGAMES 'Affinity' 0 0),
    (Reg $MMGAMES 'Background Only' 'False' 'False' 'String'),
    (Reg $MMGAMES 'Clock Rate' 10000 10000),
    (Reg $MMGAMES 'GPU Priority' 8 8),
    (Reg $MMGAMES 'Priority' 6 2),
    (Reg $MMGAMES 'Scheduling Category' 'High' 'Medium' 'String'),
    (Reg $MMGAMES 'SFIO Priority' 'High' 'Normal' 'String')
  )),
  (Ajuste 'mmcss-sem-lazy' $true @(
    (Reg $MMCSS 'NoLazyMode' 1 $null)
  )),
  (Ajuste 'game-dvr-total-off' $true @(
    (Reg $GCS 'GameDVR_Enabled' 0 1),
    (Reg $GCS 'GameDVR_FSEBehaviorMode' 2 0),
    (Reg $GCS 'GameDVR_HonorUserFSEBehaviorMode' 0 $null),
    (Reg $GCS 'GameDVR_DXGIHonorFSEWindowsCompatible' 1 0),
    (Reg $GCS 'GameDVR_EFSEFeatureFlags' 0 $null),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 0 1),
    (Reg $GAMEBAR 'ShowStartupPanel' 0 1),
    (Reg $GAMEBAR 'UseNexusForGameBarEnabled' 0 1),
    (Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\GameDVR' 'AllowGameDVR' 0 $null),
    (Reg 'HKLM:\SOFTWARE\Microsoft\PolicyManager\default\ApplicationManagement\AllowGameDVR' 'value' 0 $null)
  )),
  (Ajuste 'game-mode-on' $false @(
    (Reg $GAMEBAR 'AllowAutoGameMode' 1 0),
    (Reg $GAMEBAR 'AutoGameModeEnabled' 1 0)
  )),
  (Ajuste 'gpu-agendamento-hardware' $true @(
    (Reg $GRAPH 'HwSchMode' 2 1)
  )),
  (Ajuste 'gpu-preempcao-off' $true $RegsPreempcao @() '' $true $(if ($temNvidia) { 'NVIDIA detectada' } else { 'sem driver NVIDIA' })),
  (Ajuste 'energia-sem-throttle' $true @(
    (Reg "$POWER\PowerThrottling" 'PowerThrottlingOff' 1 0)
  )),
  (Ajuste 'energia-sem-estimativa' $true @(
    (Reg $POWER 'EnergyEstimationEnabled' 0 $null),
    (Reg "$POWER\EnergyEstimation\TaggedEnergy" 'DisableTaggedEnergyLogging' 1 $null),
    (Reg "$POWER\EnergyEstimation\TaggedEnergy" 'TelemetryMaxApplication' 0 $null),
    (Reg "$POWER\EnergyEstimation\TaggedEnergy" 'TelemetryMaxTagPerApplication' 0 $null)
  )),
  (Ajuste 'cpu-idle-off' $true @() @() 'idle' ($null -ne $planoAtivo) $(if ($null -ne $planoAtivo) { "{0} ({1})" -f $planoAtivo.nome, $planoAtivo.guid } else { $null })),
  (Ajuste 'memoria-kernel-residente' $true @(
    (Reg $MEMMGR 'DisablePagingExecutive' 1 0),
    (Reg $MEMMGR 'ClearPageFileAtShutdown' 0 0),
    (Reg $MEMMGR 'LargeSystemCache' 0 0),
    (Reg $MEMMGR 'DisablePageCombining' 1 0)
  )),
  (Ajuste 'svchost-agrupado' $true @(
    (Reg $CTRL 'SvcHostSplitThresholdInKB' $ramKb $null 'DWord' 'gte')
  ) @() '' ($ramGb -gt 0) $(if ($ramGb -gt 0) { "RAM {0} GB → {1} KB" -f $ramGb, $ramKb } else { $null })),
  (Ajuste 'prefetch-superfetch-off' $true @(
    (Reg "$MEMMGR\PrefetchParameters" 'EnablePrefetcher' 0 3),
    (Reg "$MEMMGR\PrefetchParameters" 'EnableSuperfetch' 0 3)
  ) @('SysMain') '' $discoSolido $(if ($discoSolido) { 'disco do sistema é SSD/NVMe' } else { 'disco do sistema é HDD: manter ligado' })),
  (Ajuste 'disco-sem-economia' $true @() @() 'disco-energia' $true $(if ($eScan) { "{0} chaves de driver" -f (Get-DiscoAlvos).Count } else { $null })),
  (Ajuste 'disco-sem-idle-storport' $true @() @() 'storport' $true $(
    $c = Get-StorPortContagem
    "{0} de {1} controladoras" -f $c.zero, $c.total
  )),
  (Ajuste 'rede-tcp-imediato' $true $RegsTcp @() '' ($null -ne $rotaAtiva) $(if ($null -ne $rotaAtiva) { [string]$rotaAtiva.nome } else { $null })),
  (Ajuste 'medicao-rede-off' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\Ndu' 'Start' 4 2)
  )),
  (Ajuste 'mouse-1-para-1' $false @(
    (Reg $MOUSE 'MouseSpeed' '0' '1' 'String'),
    (Reg $MOUSE 'MouseThreshold1' '0' '6' 'String'),
    (Reg $MOUSE 'MouseThreshold2' '0' '10' 'String'),
    (Reg $MOUSE 'MouseSensitivity' '10' '10' 'String'),
    (Reg $MOUSE 'SmoothMouseXCurve' $CurvaX $null 'Binary'),
    (Reg $MOUSE 'SmoothMouseYCurve' $CurvaY $null 'Binary')
  )),
  (Ajuste 'teclado-resposta-maxima' $false @(
    (Reg 'HKCU:\Control Panel\Keyboard' 'KeyboardDelay' '0' '1' 'String'),
    (Reg 'HKCU:\Control Panel\Keyboard' 'KeyboardSpeed' '31' '31' 'String')
  )),
  (Ajuste 'acessibilidade-off' $false @(
    (Reg "$ACESSO\StickyKeys" 'Flags' '506' '510' 'String'),
    (Reg "$ACESSO\Keyboard Response" 'Flags' '122' '126' 'String'),
    (Reg "$ACESSO\ToggleKeys" 'Flags' '58' '62' 'String')
  )),
  (Ajuste 'usb-suspensao-off' $true @(
    (Reg 'HKLM:\SYSTEM\CurrentControlSet\Services\USB' 'DisableSelectiveSuspend' 1 0)
  )),
  (Ajuste 'interface-sem-espera' $true @(
    (Reg $DESKTOP 'MenuShowDelay' '0' '400' 'String'),
    (Reg $DESKTOP 'HungAppTimeout' '1000' $null 'String'),
    (Reg $DESKTOP 'WaitToKillAppTimeout' '2000' $null 'String'),
    (Reg $DESKTOP 'LowLevelHooksTimeout' '1000' $null 'String'),
    (Reg $DESKTOP 'AutoEndTasks' '1' '0' 'String'),
    (Reg $DESKTOP 'DragFullWindows' '0' '1' 'String'),
    (Reg $MOUSE 'MouseHoverTime' '0' '400' 'String'),
    (Reg "$DESKTOP\WindowMetrics" 'MinAnimate' '0' '1' 'String'),
    (Reg $ADVANCED 'TaskbarAnimations' 0 1),
    (Reg $ADVANCED 'ListviewShadow' 0 1),
    (Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' 0 $null),
    (Reg $CTRL 'WaitToKillServiceTimeout' '2000' '5000' 'String')
  )),
  (Ajuste 'mitigacoes-cpu-off' $true @(
    (Reg $MEMMGR 'FeatureSettings' 1 $null),
    (Reg $MEMMGR 'FeatureSettingsOverride' 3 $null),
    (Reg $MEMMGR 'FeatureSettingsOverrideMask' 3 $null)
  ))
)

function Load-State {
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  if (Test-Path -LiteralPath $stateFile) {
    $script:estado = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  } else {
    $script:estado = [pscustomobject]@{ version = 1; ajustes = [pscustomobject]@{} }
  }
}

function Save-State {
  $tmp = Join-Path $stateDir ("fpsboost-{0}-{1}.tmp" -f $PID, [guid]::NewGuid().ToString('N'))
  $script:estado | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $stateFile -Force
}

function Test-Especial([string]$especial) {
  switch ($especial) {
    'idle' {
      $indice = Get-IdleAcIndex
      if ($null -eq $indice) { return $false }
      return ([int]$indice -eq 1)
    }
    'disco-energia' {
      $alvos = Get-DiscoAlvos
      if ($alvos.Count -eq 0) { return $false }
      foreach ($alvo in $alvos) {
        $atual = Get-RegAtual $alvo.path $alvo.name
        if (-not $atual.existed -or [int]$atual.value -ne 0) { return $false }
      }
      return $true
    }
    'storport' {
      $c = Get-StorPortContagem
      return ($c.zero -ge 1 -and $c.outro -eq 0)
    }
  }
  return $false
}

function Test-Ligado($ajuste) {
  if ($ajuste.especial) { return (Test-Especial $ajuste.especial) }
  $temAlgo = $false
  foreach ($reg in $ajuste.registros) {
    $temAlgo = $true
    $atual = Get-RegAtual $reg.path $reg.name
    if (-not $atual.existed) { return $false }
    if ($reg.cmp -eq 'gte') {
      if ((ConvertTo-UInt32 $atual.value) -lt (ConvertTo-UInt32 $reg.on)) { return $false }
    } elseif ([string]$atual.value -ne [string]$reg.on) {
      return $false
    }
  }
  foreach ($nome in $ajuste.servicos) {
    $svc = Get-CimInstance Win32_Service -Filter ("Name='{0}'" -f $nome) -ErrorAction SilentlyContinue
    if ($null -eq $svc) { continue }
    $temAlgo = $true
    if ([string]$svc.StartMode -ne 'Disabled') { return $false }
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
  $especial = @()
  if ($ajuste.especial -eq 'idle') {
    $indice = Get-IdleAcIndex
    if ($null -ne $indice) { $especial += [pscustomobject]@{ key = 'ac'; value = [int]$indice } }
  }
  if ($ajuste.especial -eq 'disco-energia') {
    foreach ($alvo in (Get-DiscoAlvos)) {
      $atual = Get-RegAtual $alvo.path $alvo.name
      if ($atual.existed) {
        $especial += [pscustomobject]@{ key = ("{0}|{1}" -f $alvo.path, $alvo.name); value = [int]$atual.value }
      }
    }
  }
  if ($ajuste.especial -eq 'storport') {
    foreach ($path in (Get-StorPortAlvos)) {
      $atual = Get-RegAtual $path 'EnableIdlePowerManagement'
      $valor = $null
      if ($atual.existed) { $valor = [int]$atual.value }
      $especial += [pscustomobject]@{ key = [string]$path; value = $valor }
    }
  }
  $script:estado.ajustes | Add-Member -NotePropertyName $nomeId -NotePropertyValue ([pscustomobject]@{
    registros = $registros; servicos = $servicos; especial = $especial
  }) -Force
  Save-State
}

function Set-RegValor([string]$path, [string]$name, $value, [string]$kind) {
  # O baseline volta do JSON como Object[] de inteiros; Binary exige byte[].
  if ($kind -eq 'Binary' -and $null -ne $value -and -not ($value -is [byte[]])) {
    $value = [byte[]]@($value | ForEach-Object { [byte]$_ })
  }
  if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -Value $value -PropertyType $kind -Force | Out-Null
}

function Set-IdleIndex([int]$indice) {
  & powercfg.exe /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR $IDLE_SET $indice 2>$null | Out-Null
  & powercfg.exe /setactive SCHEME_CURRENT 2>$null | Out-Null
}

function Apply-Especial([string]$especial, [bool]$ligar, $baseline) {
  switch ($especial) {
    'idle' {
      if ($ligar) {
        Set-IdleIndex 1
      } else {
        $anterior = @($baseline | Where-Object { [string]$_.key -eq 'ac' } | Select-Object -First 1)
        $indice = 0
        if ($anterior.Count -gt 0 -and $null -ne $anterior[0].value) { $indice = [int]$anterior[0].value }
        Set-IdleIndex $indice
      }
    }
    'disco-energia' {
      if ($ligar) {
        foreach ($alvo in (Get-DiscoAlvos)) {
          try { Set-RegValor $alvo.path $alvo.name 0 'DWord' } catch {}
        }
      } else {
        foreach ($entry in @($baseline)) {
          $partes = ([string]$entry.key -split '\|')
          if ($partes.Count -lt 2) { continue }
          try { Set-RegValor $partes[0] $partes[1] ([int]$entry.value) 'DWord' } catch {}
        }
      }
    }
    'storport' {
      if ($ligar) {
        foreach ($path in (Get-StorPortAlvos)) {
          # Algumas controladoras negam escrita sem posse da chave. Tomar posse
          # sairia caro demais pra desfazer: falha vira cobertura parcial.
          try { Set-RegValor $path 'EnableIdlePowerManagement' 0 'DWord' } catch {}
        }
      } else {
        foreach ($entry in @($baseline)) {
          $path = [string]$entry.key
          try {
            if ($null -ne $entry.value) {
              Set-RegValor $path 'EnableIdlePowerManagement' ([int]$entry.value) 'DWord'
            } elseif (Test-Path -LiteralPath $path) {
              Remove-ItemProperty -LiteralPath $path -Name 'EnableIdlePowerManagement' -ErrorAction SilentlyContinue
            }
          } catch {}
        }
      }
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
    Set-RegValor $reg.path $reg.name $reg.on $reg.kind
  }
  foreach ($nome in $ajuste.servicos) {
    $svc = Get-Service -Name $nome -ErrorAction SilentlyContinue
    if ($null -eq $svc) { continue }
    if ($svc.Status -eq 'Running' -and $svc.CanStop) { Stop-Service -Name $nome -Force -ErrorAction SilentlyContinue }
    Set-Service -Name $nome -StartupType Disabled -ErrorAction SilentlyContinue
  }
}

function Apply-Off($ajuste) {
  $nomeId = [string]$ajuste.id
  $baseline = $null
  if ($script:estado.ajustes.PSObject.Properties[$nomeId]) { $baseline = $script:estado.ajustes.$nomeId }

  if ($ajuste.especial) {
    $dados = @()
    if ($baseline) { $dados = $baseline.especial }
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
  } else {
    foreach ($reg in $ajuste.registros) {
      if ($null -eq $reg.off) {
        if (Test-Path -LiteralPath $reg.path) { Remove-ItemProperty -LiteralPath $reg.path -Name $reg.name -ErrorAction SilentlyContinue }
      } else {
        Set-RegValor $reg.path $reg.name $reg.off $reg.kind
      }
    }
    foreach ($nome in $ajuste.servicos) {
      Set-Service -Name $nome -StartupType Manual -ErrorAction SilentlyContinue
    }
  }

  if ($baseline) {
    $script:estado.ajustes.PSObject.Properties.Remove($nomeId)
    Save-State
  }
}

try {
  $locked = $mutex.WaitOne(5000)
  if (-not $locked) { throw 'ERR_FPSBOOST_BUSY' }
  Load-State

  $acao = [string]$env:PLFCORE_FPSBOOST_ACTION

  if ($acao -eq 'scan') {
    $itens = foreach ($ajuste in $Ajustes) {
      [pscustomobject]@{
        id = $ajuste.id
        ligado = (Test-Ligado $ajuste)
        precisaAdmin = [bool]$ajuste.admin
        disponivel = [bool]$ajuste.disponivel
        detalhe = $ajuste.detalhe
      }
    }
    [pscustomobject]@{
      items = @($itens); admin = (Test-IsAdmin); ramGb = $ramGb
      discoSolido = [bool]$discoSolido; origin = 'measured'
    } | ConvertTo-Json -Depth 4 -Compress
    exit 0
  }

  if ($acao -eq 'on' -or $acao -eq 'off') {
    $id = [string]$env:PLFCORE_FPSBOOST_ID
    $ajuste = $Ajustes | Where-Object { $_.id -eq $id } | Select-Object -First 1
    if ($null -eq $ajuste) { throw 'ERR_FPSBOOST_NOT_FOUND' }
    if ($ajuste.admin -and -not (Test-IsAdmin)) { throw 'ERR_FPSBOOST_ADMIN' }
    if ($acao -eq 'on' -and -not $ajuste.disponivel) { throw 'ERR_FPSBOOST_INDISPONIVEL' }
    if ($acao -eq 'on') { Apply-On $ajuste } else { Apply-Off $ajuste }
    [pscustomobject]@{ id = $id; ligado = (Test-Ligado $ajuste); origin = 'measured' } | ConvertTo-Json -Compress
    exit 0
  }

  throw 'ERR_FPSBOOST_ACTION'
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
