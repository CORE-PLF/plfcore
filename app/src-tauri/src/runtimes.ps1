$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# VC++ 2012/2013/2015+ e XNA só existem na view 32-bit, mesmo em x64: ler uma
# view só devolve "não instalado" com o runtime presente.
function Get-RegDuasViews([string]$sub, [string]$nome) {
  foreach ($raiz in @("HKLM:\SOFTWARE\$sub", "HKLM:\SOFTWARE\WOW6432Node\$sub")) {
    try {
      $valor = (Get-ItemProperty -LiteralPath $raiz -Name $nome -ErrorAction Stop).$nome
      if ($null -ne $valor) { return $valor }
    } catch {}
  }
  return $null
}

function Test-ProductCode([string]$codigo) {
  foreach ($raiz in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
                      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    if (Test-Path -LiteralPath (Join-Path $raiz $codigo)) { return $true }
  }
  return $false
}

function Get-VcRuntime([string]$versao, [string]$arq) {
  $sub = "Microsoft\VisualStudio\$versao\VC\Runtimes\$arq"
  $instalado = Get-RegDuasViews $sub 'Installed'
  if ($null -eq $instalado -or [int]$instalado -ne 1) { return $null }
  $v = Get-RegDuasViews $sub 'Version'
  if ($v) { return [string]$v }
  return 'ok'
}

$DirectXDlls = @(
  'd3dx9_43.dll', 'd3dx10_43.dll', 'd3dx11_43.dll', 'd3dcompiler_43.dll',
  'xinput1_3.dll', 'xaudio2_7.dll', 'x3daudio1_7.dll', 'XAPOFX1_5.dll'
)

function Get-DirectXFaltando {
  $faltando = @()
  $pastas = @((Join-Path $env:SystemRoot 'System32'))
  $wow = Join-Path $env:SystemRoot 'SysWOW64'
  if (Test-Path -LiteralPath $wow) { $pastas += $wow }
  foreach ($dll in $DirectXDlls) {
    foreach ($pasta in $pastas) {
      if (-not (Test-Path -LiteralPath (Join-Path $pasta $dll))) { $faltando += $dll; break }
    }
  }
  return @($faltando)
}

function Get-DotnetDesktop([string]$major) {
  $raiz = Join-Path $env:ProgramFiles 'dotnet\shared\Microsoft.WindowsDesktop.App'
  if (-not (Test-Path -LiteralPath $raiz)) { return $null }
  $achados = @(Get-ChildItem -LiteralPath $raiz -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "$major.*" } | Sort-Object Name -Descending)
  if ($achados.Count -eq 0) { return $null }
  return [string]$achados[0].Name
}

$NetFxMapa = @(
  @(533320, '4.8.1'), @(528040, '4.8'), @(461808, '4.7.2'), @(461308, '4.7.1'),
  @(460798, '4.7'), @(394802, '4.6.2'), @(394254, '4.6.1'), @(393295, '4.6'),
  @(379893, '4.5.2'), @(378675, '4.5.1'), @(378389, '4.5')
)

function Get-NetFramework {
  $release = $null
  try {
    $release = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name 'Release' -ErrorAction Stop).Release
  } catch { return $null }
  if ($null -eq $release) { return $null }
  foreach ($par in $NetFxMapa) {
    if ([int]$release -ge [int]$par[0]) { return [string]$par[1] }
  }
  return $null
}

function Item([string]$id, [string]$pacote, [bool]$opcional, [scriptblock]$detector, [string]$tipoInstalador = '') {
  return [pscustomobject]@{ id = $id; pacote = $pacote; opcional = $opcional; detector = $detector; tipoInstalador = $tipoInstalador }
}

$Runtimes = @(
  (Item 'vc2015-x64' 'Microsoft.VCRedist.2015+.x64' $false { Get-VcRuntime '14.0' 'x64' }),
  (Item 'vc2015-x86' 'Microsoft.VCRedist.2015+.x86' $false { Get-VcRuntime '14.0' 'x86' }),
  (Item 'vc2013-x64' 'Microsoft.VCRedist.2013.x64' $false { Get-VcRuntime '12.0' 'x64' }),
  (Item 'vc2013-x86' 'Microsoft.VCRedist.2013.x86' $false { Get-VcRuntime '12.0' 'x86' }),
  (Item 'vc2012-x64' 'Microsoft.VCRedist.2012.x64' $false { Get-VcRuntime '11.0' 'x64' }),
  (Item 'vc2012-x86' 'Microsoft.VCRedist.2012.x86' $false { Get-VcRuntime '11.0' 'x86' }),
  (Item 'vc2010-x64' 'Microsoft.VCRedist.2010.x64' $true { if (Test-ProductCode '{1D8E6291-B0D5-35EC-8441-6616F567A0F7}') { 'ok' } else { $null } }),
  (Item 'vc2010-x86' 'Microsoft.VCRedist.2010.x86' $true { if (Test-ProductCode '{F0C3E5D1-1ADE-321E-8167-68EF0DE699A5}') { 'ok' } else { $null } }),
  (Item 'vc2008-x64' 'Microsoft.VCRedist.2008.x64' $true { if (Test-ProductCode '{5FCE6D76-F5DC-37AB-B2B8-22AB8CEDB1D4}') { 'ok' } else { $null } }),
  (Item 'vc2008-x86' 'Microsoft.VCRedist.2008.x86' $true { if (Test-ProductCode '{9BE518E6-ECC6-35A9-88E4-87755C07200F}') { 'ok' } else { $null } }),
  (Item 'vc2005-x64' 'Microsoft.VCRedist.2005.x64' $true { if (Test-ProductCode '{ad8a2fa1-06e7-4b0d-927d-6e54b3d31028}') { 'ok' } else { $null } }),
  (Item 'vc2005-x86' 'Microsoft.VCRedist.2005.x86' $true { if (Test-ProductCode '{710f4c1c-cc18-4c49-8cbf-51240c89a1a2}') { 'ok' } else { $null } }),
  (Item 'directx' 'Microsoft.DirectX' $false { if ((Get-DirectXFaltando).Count -eq 0) { 'ok' } else { $null } } 'exe'),
  (Item 'dotnet-desktop-8' 'Microsoft.DotNet.DesktopRuntime.8' $false { Get-DotnetDesktop '8' }),
  (Item 'dotnet-desktop-9' 'Microsoft.DotNet.DesktopRuntime.9' $true { Get-DotnetDesktop '9' }),
  (Item 'xna' 'Microsoft.XNARedist' $true { $v = Get-RegDuasViews 'Microsoft\XNA\Framework\v4.0' 'Installed'; if ($null -ne $v -and [int]$v -eq 1) { 'ok' } else { $null } }),
  # O pacote winget do .NET Framework só instala em ARM64: aqui é diagnóstico, nunca instalação.
  (Item 'netfx' '' $false { Get-NetFramework })
)

function Get-WingetOk {
  $cmd = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $cmd) { return $false }
  try {
    $null = & winget --version 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

function Get-Estado($item) {
  $versao = $null
  try { $versao = & $item.detector } catch {}
  $detalhe = ''
  if ($item.id -eq 'directx') {
    $faltando = Get-DirectXFaltando
    if ($faltando.Count -gt 0) { $detalhe = ($faltando -join ' ') }
  }
  return [pscustomobject]@{
    id = $item.id
    instalado = ($null -ne $versao)
    versao = [string]$versao
    detalhe = $detalhe
    opcional = [bool]$item.opcional
    instalavel = [bool]$item.pacote
  }
}

# 0 e os três seguintes são sucesso: já instalado, já atualizado, e instalado
# pedindo reinício. Tratar tudo != 0 como falha reporta erro onde não houve.
$WingetOk = @(0, -1978335135, -1978335189, -1978334967)
$WingetReinicio = -1978334967

function Install-Runtime($item) {
  if (-not $item.pacote) { throw 'ERR_RUNTIME_NAO_INSTALAVEL' }
  $args = @(
    'install', '--id', $item.pacote, '--exact', '--source', 'winget',
    '--accept-source-agreements', '--accept-package-agreements',
    '--silent', '--disable-interactivity', '--no-upgrade', '--scope', 'machine'
  )
  if ($item.tipoInstalador) { $args += @('--installer-type', $item.tipoInstalador) }
  $null = & winget @args 2>&1
  $codigo = $LASTEXITCODE
  return [pscustomobject]@{ codigo = $codigo; ok = ($WingetOk -contains $codigo); reinicio = ($codigo -eq $WingetReinicio) }
}

$acao = [string]$env:PLFCORE_RUNTIMES_ACTION

if ($acao -eq 'scan') {
  $itens = foreach ($item in $Runtimes) { Get-Estado $item }
  [pscustomobject]@{ items = @($itens); winget = (Get-WingetOk); admin = (Test-IsAdmin); origin = 'measured' } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

if ($acao -eq 'install') {
  $id = [string]$env:PLFCORE_RUNTIMES_ID
  $item = $Runtimes | Where-Object { $_.id -eq $id } | Select-Object -First 1
  if ($null -eq $item) { throw 'ERR_RUNTIME_NOT_FOUND' }
  if (-not (Get-WingetOk)) { throw 'ERR_WINGET_AUSENTE' }
  if (-not (Test-IsAdmin)) { throw 'ERR_RUNTIME_ADMIN' }
  $resultado = Install-Runtime $item
  # A verdade é o detector, não o código de saída: o instalador do DirectX pode
  # sair 0 sem depositar as DLLs legadas.
  $estado = Get-Estado $item
  [pscustomobject]@{
    id = $id; ok = [bool]$resultado.ok; codigo = $resultado.codigo; reinicio = [bool]$resultado.reinicio
    instalado = [bool]$estado.instalado; versao = $estado.versao; detalhe = $estado.detalhe; origin = 'measured'
  } | ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_RUNTIMES_ACTION'
