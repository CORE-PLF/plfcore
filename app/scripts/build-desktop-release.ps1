param(
  [Parameter(Mandatory = $true)]
  [string]$ApiBaseUrl,

  [string]$OutputDirectory = "artifacts",

  [switch]$AllowUnsigned
)

$ErrorActionPreference = 'Stop'
$api = $ApiBaseUrl.Trim().TrimEnd('/')
if (-not $api.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'ApiBaseUrl precisa usar HTTPS.'
}
$repo = Split-Path -Parent $PSScriptRoot
$output = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $repo $OutputDirectory))
}
if (-not $output.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'OutputDirectory precisa ficar dentro do repositório.'
}

$env:PLFCORE_API_BASE_URL = $api
Push-Location $repo
try {
  & npm.cmd run tauri build
  if ($LASTEXITCODE -ne 0) { throw "tauri build falhou com código $LASTEXITCODE" }

  $bundle = Join-Path $repo 'src-tauri\target\release\bundle\nsis'
  $installers = @(Get-ChildItem -LiteralPath $bundle -Filter '*-setup.exe' -File | Sort-Object LastWriteTime -Descending)
  if ($installers.Count -eq 0) { throw "Instalador NSIS não encontrado em $bundle" }

  $signature = Get-AuthenticodeSignature -LiteralPath $installers[0].FullName
  if (-not $AllowUnsigned -and $signature.Status -ne 'Valid') {
    throw "Assinatura Authenticode inválida ou ausente: $($signature.Status). Use -AllowUnsigned somente para piloto controlado."
  }

  New-Item -ItemType Directory -Path $output -Force | Out-Null
  $destination = Join-Path $output 'PLFCoreSetup.exe'
  Copy-Item -LiteralPath $installers[0].FullName -Destination $destination -Force
  $hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath (Join-Path $output 'PLFCoreSetup.sha256') -Value $hash -Encoding ascii

  [pscustomobject]@{
    Installer = $destination
    Sha256 = $hash
    Api = $api
    Signature = $signature.Status.ToString()
  } | Format-List
} finally {
  Pop-Location
  Remove-Item Env:\PLFCORE_API_BASE_URL -ErrorAction SilentlyContinue
}
