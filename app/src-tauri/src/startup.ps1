$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Fontes = @(
  [pscustomobject]@{ id = 'hkcu-run'; tipo = 'registro'; chave = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'; aprovacao = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; admin = $false },
  [pscustomobject]@{ id = 'hklm-run'; tipo = 'registro'; chave = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'; aprovacao = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'; admin = $true },
  [pscustomobject]@{ id = 'hklm-run32'; tipo = 'registro'; chave = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'; aprovacao = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run32'; admin = $true },
  [pscustomobject]@{ id = 'pasta-usuario'; tipo = 'pasta'; chave = [Environment]::GetFolderPath('Startup'); aprovacao = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'; admin = $false },
  [pscustomobject]@{ id = 'pasta-comum'; tipo = 'pasta'; chave = [Environment]::GetFolderPath('CommonStartup'); aprovacao = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'; admin = $true }
)

$Protegidos = '(?i)^(SecurityHealth|WindowsDefender)'

function Test-IsAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-Aprovacao([string]$chave, [string]$nome) {
  try {
    $bytes = Get-ItemPropertyValue -LiteralPath $chave -Name $nome -ErrorAction Stop
    if ($bytes -is [byte[]] -and $bytes.Length -ge 1) { return (($bytes[0] -band 1) -eq 0) }
  } catch {}
  return $true
}

function Set-Aprovacao([string]$chave, [string]$nome, [bool]$ativar) {
  if (-not (Test-Path -LiteralPath $chave)) { New-Item -Path $chave -Force | Out-Null }
  $bytes = New-Object 'byte[]' 12
  if ($ativar) {
    $bytes[0] = 2
  } else {
    $bytes[0] = 3
    $carimbo = [BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc())
    [Array]::Copy($carimbo, 0, $bytes, 4, 8)
  }
  New-ItemProperty -LiteralPath $chave -Name $nome -Value $bytes -PropertyType Binary -Force | Out-Null
}

function Get-Entradas {
  $itens = New-Object 'System.Collections.Generic.List[object]'
  foreach ($fonte in $Fontes) {
    if ($fonte.tipo -eq 'registro') {
      if (-not (Test-Path -LiteralPath $fonte.chave)) { continue }
      $key = Get-Item -LiteralPath $fonte.chave
      foreach ($nome in $key.GetValueNames()) {
        if (-not $nome) { continue }
        $comando = [string]$key.GetValue($nome, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        $itens.Add([pscustomobject]@{
          id = ('{0}|{1}' -f $fonte.id, $nome)
          nome = $nome
          comando = $comando
          origemId = $fonte.id
          ativado = (Get-Aprovacao $fonte.aprovacao $nome)
          precisaAdmin = $fonte.admin
          protegido = ($nome -match $Protegidos)
        })
      }
    } else {
      if (-not ($fonte.chave -and (Test-Path -LiteralPath $fonte.chave))) { continue }
      foreach ($arquivo in (Get-ChildItem -LiteralPath $fonte.chave -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne 'desktop.ini' })) {
        $itens.Add([pscustomobject]@{
          id = ('{0}|{1}' -f $fonte.id, $arquivo.Name)
          nome = [System.IO.Path]::GetFileNameWithoutExtension($arquivo.Name)
          comando = [string]$arquivo.FullName
          origemId = $fonte.id
          ativado = (Get-Aprovacao $fonte.aprovacao $arquivo.Name)
          precisaAdmin = $fonte.admin
          protegido = ($arquivo.Name -match $Protegidos)
        })
      }
    }
  }
  return $itens
}

$acao = [string]$env:RESYNC_STARTUP_ACTION

if ($acao -eq 'scan') {
  [pscustomobject]@{ items = @(Get-Entradas); admin = (Test-IsAdmin); origin = 'measured' } | ConvertTo-Json -Depth 4 -Compress
  exit 0
}

if ($acao -eq 'toggle') {
  $id = [string]$env:RESYNC_STARTUP_ID
  $ativar = ([string]$env:RESYNC_STARTUP_STATE -eq 'on')
  $alvo = @(Get-Entradas) | Where-Object { $_.id -eq $id } | Select-Object -First 1
  if ($null -eq $alvo) { throw 'ERR_STARTUP_NOT_FOUND' }
  if ($alvo.protegido) { throw 'ERR_STARTUP_PROTECTED' }
  if ($alvo.precisaAdmin -and -not (Test-IsAdmin)) { throw 'ERR_STARTUP_ADMIN' }
  $fonte = $Fontes | Where-Object { $_.id -eq $alvo.origemId } | Select-Object -First 1
  $nome = $alvo.id.Substring($alvo.origemId.Length + 1)
  Set-Aprovacao $fonte.aprovacao $nome $ativar
  $depois = @(Get-Entradas) | Where-Object { $_.id -eq $id } | Select-Object -First 1
  if ($null -eq $depois -or [bool]$depois.ativado -ne $ativar) { throw 'ERR_STARTUP_VERIFY' }
  [pscustomobject]@{ id = $id; ativado = [bool]$depois.ativado; origin = 'measured' } | ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_STARTUP_ACTION'
