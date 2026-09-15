$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function NZ($v) { if ($null -eq $v -or $v -eq '') { $null } else { $v } }

$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$board = Get-CimInstance Win32_BaseBoard | Select-Object -First 1
$bios = Get-CimInstance Win32_BIOS | Select-Object -First 1
$os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
$cs = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController)
$displayGpu = $gpus | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1
$gpu = $gpus | Sort-Object -Descending -Property @{ Expression = {
  $score = 0
  $name = [string]$_.Name
  if ($name -match '(?i)(NVIDIA|AMD\s+Radeon|Radeon\s+RX|Intel\s+Arc)') { $score += 100000 }
  if ($name -match '(?i)(Microsoft Basic|Remote|Virtual|Citrix)') { $score -= 1000000 }
  if ($_.CurrentHorizontalResolution) { $score += 10000 }
  if ($_.AdapterRAM) { $score += [math]::Min(8192, [double]$_.AdapterRAM / 1MB) }
  $score
} } | Select-Object -First 1

$sticks = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
  @{
    slot = [string]$_.DeviceLocator
    capacidadeGb = [math]::Round($_.Capacity / 1GB, 1)
    velocidadeMhz = [int]$_.ConfiguredClockSpeed
    partNumber = NZ ($_.PartNumber -replace '\s+$', '')
    fabricante = NZ ($_.Manufacturer -replace '\s+$', '')
    ocupado = $true
  }
})
$memTotal = [math]::Round(($cs.TotalPhysicalMemory / 1GB), 1)
$ddr = switch ([int](Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).SMBIOSMemoryType) {
  26 { 'DDR4' } 34 { 'DDR5' } 24 { 'DDR3' } default { 'DDR' }
}
$canal = if ($sticks.Count -eq 1) { 'single' } else { $null }

$physDisks = @(Get-CimInstance -Namespace root/microsoft/windows/storage MSFT_PhysicalDisk)
$reliability = @(Get-CimInstance -Namespace root/microsoft/windows/storage MSFT_StorageReliabilityCounter)
$logical = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")
$discos = @(Get-CimInstance Win32_DiskDrive | Where-Object { $_.MediaType -notmatch 'Removable' -and $_.Size -gt 1GB } | ForEach-Object {
  $dd = $_
  $idx = $dd.Index
  $pd = $physDisks | Where-Object { $_.DeviceId -eq [string]$idx } | Select-Object -First 1
  $rel = $null
  if ($pd) { $rel = $reliability | Where-Object { $_.DeviceId -eq $pd.ObjectId -or $_.DeviceId -eq $pd.DeviceId } | Select-Object -First 1 }
  $tipo = 'HDD'
  if ($pd) {
    if ($pd.BusType -eq 17) { $tipo = 'NVMe' }
    elseif ($pd.MediaType -eq 4) { $tipo = 'SSD' }
    elseif ($pd.MediaType -eq 3) { $tipo = 'HDD' }
  } elseif ($dd.Model -match 'NVMe') { $tipo = 'NVMe' } elseif ($dd.Model -match 'SSD') { $tipo = 'SSD' }
  $status = 'saudavel'
  if ($pd -and $pd.HealthStatus -eq 1) { $status = 'atencao' }
  if ($pd -and $pd.HealthStatus -ge 2) { $status = 'critico' }
  $parts = @(Get-CimInstance -Query "ASSOCIATORS OF {Win32_DiskDrive.DeviceID='$($dd.DeviceID)'} WHERE AssocClass=Win32_DiskDriveToDiskPartition" |
    ForEach-Object { Get-CimInstance -Query "ASSOCIATORS OF {Win32_DiskPartition.DeviceID='$($_.DeviceID)'} WHERE AssocClass=Win32_LogicalDiskToPartition" } |
    ForEach-Object { $_.DeviceID })
  $usado = 0
  foreach ($p in $parts) {
    $ld = $logical | Where-Object { $_.DeviceID -eq $p } | Select-Object -First 1
    if ($ld) { $usado += ($ld.Size - $ld.FreeSpace) }
  }
  @{
    modelo = [string]$dd.Model
    tipo = $tipo
    capacidadeGb = [math]::Round($dd.Size / 1GB, 0)
    usadoGb = [math]::Round($usado / 1GB, 0)
    tempC = if ($rel -and $rel.Temperature -gt 0) { [int]$rel.Temperature } else { $null }
    particoes = $parts
    smart = @{
      status = $status
      horasLigadas = if ($rel -and $rel.PowerOnHours -gt 0) { [int]$rel.PowerOnHours } else { $null }
      ciclos = if ($rel -and $rel.StartStopCycleCount -gt 0) { [int]$rel.StartStopCycleCount } else { $null }
      tbw = if ($rel -and $rel.TotalWritesToDevice -gt 0) { [math]::Round($rel.TotalWritesToDevice / 1TB, 1) } else { $null }
    }
  }
})

$netCfgs = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=TRUE")
$rotaIf = $null
try {
  $rotaIf = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1 -ExpandProperty InterfaceIndex
} catch {}
$netCfg = if ($rotaIf) { $netCfgs | Where-Object { $_.InterfaceIndex -eq $rotaIf } | Select-Object -First 1 } else { $null }
if ($null -eq $netCfg) { $netCfg = ($netCfgs | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1) }
if ($null -eq $netCfg) { $netCfg = $netCfgs | Select-Object -First 1 }
$netAd = $null
if ($netCfg) { $netAd = Get-CimInstance Win32_NetworkAdapter -Filter "Index=$($netCfg.Index)" }

$monitores = @()
$wmiMon = @(Get-CimInstance -Namespace root/wmi WmiMonitorID)
$i = 0
foreach ($m in $wmiMon) {
  $nome = $null
  if ($m.UserFriendlyName) { $nome = ([System.Text.Encoding]::ASCII.GetString($m.UserFriendlyName)).Trim([char]0) }
  $fab = $null
  if ($m.ManufacturerName) { $fab = ([System.Text.Encoding]::ASCII.GetString($m.ManufacturerName)).Trim([char]0) }
  $monitores += @{
    fabricante = NZ $fab
    modelo = NZ $nome
    resolucao = if ($i -eq 0 -and $displayGpu -and $displayGpu.CurrentHorizontalResolution) { "$($displayGpu.CurrentHorizontalResolution)x$($displayGpu.CurrentVerticalResolution)" } else { $null }
    taxaHz = if ($i -eq 0 -and $displayGpu -and $displayGpu.CurrentRefreshRate) { [int]$displayGpu.CurrentRefreshRate } else { $null }
    principal = ($i -eq 0)
  }
  $i++
}

$audioDevs = @(Get-CimInstance Win32_SoundDevice | ForEach-Object { [string]$_.Name })

$plano = (powercfg /getactivescheme) -replace '^.*\((.*)\).*$', '$1'
$bat = Get-CimInstance Win32_Battery | Select-Object -First 1

$usb = @(Get-CimInstance Win32_USBControllerDevice).Count
$mouse = Get-MouseModel
$teclado = Get-KeyboardModel

$uptime = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)

$secureBoot = $null
try { $secureBoot = [bool](Get-ItemPropertyValue 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' 'UEFISecureBootEnabled' -ErrorAction Stop) } catch {}

$vramGb = if ($gpu -and $gpu.AdapterRAM) { [math]::Round($gpu.AdapterRAM / 1GB, 0) } else { $null }
try {
  $gpuRegs = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*' -ErrorAction Stop |
    Where-Object { $_.'HardwareInformation.qwMemorySize' -gt 0 })
  $gpuPnp = ([string]$gpu.PNPDeviceID).ToLowerInvariant()
  $matched = $gpuRegs | Where-Object {
    $matchingId = ([string]$_.MatchingDeviceId).ToLowerInvariant()
    $matchingId -and $gpuPnp.StartsWith($matchingId)
  } | Select-Object -First 1
  if ($matched) { $qw = $matched.'HardwareInformation.qwMemorySize' }
  else { $qw = ($gpuRegs | Measure-Object -Property 'HardwareInformation.qwMemorySize' -Maximum).Maximum }
  if ($qw -gt 0) { $vramGb = [math]::Round($qw / 1GB, 0) }
} catch {}

$inventory = @{
  cpu = @{
    nome = ([string]$cpu.Name).Trim()
    nucleos = [int]$cpu.NumberOfCores
    threads = [int]$cpu.NumberOfLogicalProcessors
    clockBaseGhz = [math]::Round($cpu.MaxClockSpeed / 1000, 2)
    clockAtualGhz = [math]::Round($cpu.CurrentClockSpeed / 1000, 2)
    cacheL2Mb = [math]::Round($cpu.L2CacheSize / 1024, 1)
    cacheL3Mb = [math]::Round($cpu.L3CacheSize / 1024, 1)
    soquete = [string]$cpu.SocketDesignation
    tempC = $null
    usoPct = [int]$cpu.LoadPercentage
  }
  board = @{
    fabricante = NZ ([string]$board.Manufacturer)
    modelo = NZ ([string]$board.Product)
    chipset = $null
    biosVersao = NZ ([string]$bios.SMBIOSBIOSVersion)
    biosData = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { $null }
    modoUefi = (Test-Path 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State')
    secureBoot = $secureBoot
    serial = NZ $board.SerialNumber
  }
  memoria = @{
    totalGb = $memTotal
    velocidadeMhz = if ($sticks.Count -gt 0) { $sticks[0].velocidadeMhz } else { 0 }
    tecnologia = $ddr
    canal = $canal
    sticks = $sticks
  }
  gpu = @{
    nome = if ($gpu) { NZ ([string]$gpu.Name) } else { $null }
    vramGb = $vramGb
    driverVersao = if ($gpu) { NZ ([string]$gpu.DriverVersion) } else { $null }
    driverData = if ($gpu.DriverDate) { $gpu.DriverDate.ToString('yyyy-MM-dd') } else { $null }
    resolucaoAtiva = if ($displayGpu -and $displayGpu.CurrentHorizontalResolution) { "$($displayGpu.CurrentHorizontalResolution)x$($displayGpu.CurrentVerticalResolution)" } else { $null }
    taxaHz = if ($displayGpu -and $displayGpu.CurrentRefreshRate) { [int]$displayGpu.CurrentRefreshRate } else { $null }
  }
  discos = $discos
  rede = @{
    adaptador = if ($netAd) { NZ ([string]$netAd.Name) } else { $null }
    velocidadeLinkMbps = if ($netAd -and $netAd.Speed) { [math]::Round($netAd.Speed / 1e6, 0) } else { $null }
    ipv4 = if ($netCfg -and $netCfg.IPAddress) { [string]($netCfg.IPAddress | Where-Object { $_ -match '^\d+\.' } | Select-Object -First 1) } else { $null }
    gateway = if ($netCfg -and $netCfg.DefaultIPGateway) { [string]$netCfg.DefaultIPGateway[0] } else { $null }
    mac = if ($netCfg) { NZ $netCfg.MACAddress } else { $null }
    dhcp = if ($netCfg) { [bool]$netCfg.DHCPEnabled } else { $null }
  }
  monitores = $monitores
  audio = @{
    saidaPadrao = if ($audioDevs.Count -gt 0) { $audioDevs[0] } else { $null }
    dispositivos = $audioDevs
  }
  energia = @{
    planoAtivo = [string]$plano
    bateria = if ($bat) { @{ percentual = [int]$bat.EstimatedChargeRemaining; carregando = ($bat.BatteryStatus -eq 2) } } else { $null }
  }
  perifericos = @{
    usbCount = $usb
    mouse = NZ $mouse
    teclado = NZ $teclado
  }
  os = @{
    edicao = [string]$os.Caption
    build = [string]$os.BuildNumber
    dataInstalacao = $os.InstallDate.ToString('yyyy-MM-dd')
    uptimeHoras = $uptime
  }
  origin = 'measured'
}

$idStr = "$($inventory.cpu.nome)|$($inventory.board.modelo)|$($inventory.gpu.nome)|$(($discos | ForEach-Object { $_.modelo }) -join ',')|$memTotal"
[int64]$h = 5381
foreach ($ch in $idStr.ToCharArray()) { $h = (($h * 33) -bxor [int64][char]$ch) -band 4294967295 }

$machineRecord = @{
  hostname = [string]$cs.Name
  emServicoDesde = $os.InstallDate.ToString('yyyy-MM-dd')
  horasOperacao = if ($discos.Count -gt 0) { $discos[0].smart.horasLigadas } else { $null }
  serialBios = NZ $bios.SerialNumber
  assinatura = '0x' + ([uint32]$h).ToString('X8')
}

@{ inventory = $inventory; machineRecord = $machineRecord } | ConvertTo-Json -Depth 8 -Compress
