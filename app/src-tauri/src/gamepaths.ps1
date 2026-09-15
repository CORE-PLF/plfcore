function Get-SteamLibraries {
  $roots = @()
  foreach ($key in @('HKCU:\SOFTWARE\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
    try {
      $path = (Get-ItemProperty -LiteralPath $key -ErrorAction Stop).InstallPath
      if ($path -and (Test-Path -LiteralPath $path)) { $roots += [string]$path }
    } catch {}
  }
  $libraries = New-Object 'System.Collections.Generic.List[string]'
  foreach ($root in ($roots | Select-Object -Unique)) {
    $libraries.Add($root)
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (-not (Test-Path -LiteralPath $vdf)) { continue }
    $texto = Get-Content -LiteralPath $vdf -Raw -ErrorAction SilentlyContinue
    foreach ($m in [regex]::Matches([string]$texto, '(?im)^\s*"path"\s+"(.+?)"\s*$')) {
      $libraries.Add(($m.Groups[1].Value -replace '\\\\', '\'))
    }
  }
  return @($libraries | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ })
}

function Get-SteamAppPath([string]$appid, [string]$rel) {
  foreach ($library in (Get-SteamLibraries)) {
    $manifest = Join-Path $library ("steamapps\appmanifest_{0}.acf" -f $appid)
    if (-not (Test-Path -LiteralPath $manifest)) { continue }
    $texto = Get-Content -LiteralPath $manifest -Raw -ErrorAction SilentlyContinue
    $m = [regex]::Match([string]$texto, '(?im)^\s*"installdir"\s+"(.+?)"\s*$')
    if (-not $m.Success) { continue }
    $exe = Join-Path (Join-Path (Join-Path $library 'steamapps\common') $m.Groups[1].Value) $rel
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-SteamShaderCache([string]$appid) {
  $dirs = @()
  foreach ($library in (Get-SteamLibraries)) {
    $dir = Join-Path $library ("steamapps\shadercache\{0}" -f $appid)
    if (Test-Path -LiteralPath $dir) { $dirs += $dir }
  }
  return $dirs
}

function Get-EpicAppPath([string]$displayName, [string]$rel) {
  $manifests = Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
  if (-not (Test-Path -LiteralPath $manifests)) { return $null }
  foreach ($item in (Get-ChildItem -LiteralPath $manifests -Filter '*.item' -File -ErrorAction SilentlyContinue)) {
    try {
      $dados = Get-Content -LiteralPath $item.FullName -Raw | ConvertFrom-Json
      if ([string]$dados.DisplayName -ne $displayName) { continue }
      $exe = Join-Path ([string]$dados.InstallLocation) $rel
      if (Test-Path -LiteralPath $exe) { return $exe }
    } catch {}
  }
  return $null
}

function Get-UninstallLocation([string]$subkey) {
  foreach ($hive in @('HKCU:', 'HKLM:')) {
    foreach ($base in @('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
      try {
        $local = (Get-ItemProperty -LiteralPath ("{0}\{1}\{2}" -f $hive, $base, $subkey) -ErrorAction Stop).InstallLocation
        if ($local -and (Test-Path -LiteralPath $local)) { return [string]$local }
      } catch {}
    }
  }
  return $null
}

function Get-LeaguePath {
  $base = Get-UninstallLocation 'Riot Game league_of_legends.live'
  $candidatos = New-Object 'System.Collections.Generic.List[string]'
  if ($base) { $candidatos.Add($base) }
  foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    $candidatos.Add((Join-Path $drive.Root 'Riot Games\League of Legends'))
  }
  foreach ($local in ($candidatos | Select-Object -Unique)) {
    $exe = Join-Path $local 'Game\League of Legends.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-ValorantPath {
  $base = Get-UninstallLocation 'Riot Game valorant.live'
  $candidatos = New-Object 'System.Collections.Generic.List[string]'
  if ($base) { $candidatos.Add($base) }
  foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    $candidatos.Add((Join-Path $drive.Root 'Riot Games\VALORANT\live'))
  }
  foreach ($local in ($candidatos | Select-Object -Unique)) {
    $exe = Join-Path $local 'ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-FiveMPath {
  foreach ($base in @("$env:LOCALAPPDATA\FiveM", "$env:LOCALAPPDATA\FiveM\FiveM.app")) {
    $exe = Join-Path $base 'FiveM.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-Gta5Path {
  $exe = Get-SteamAppPath '3240220' 'GTA5_Enhanced.exe'
  if ($exe) { return $exe }
  $exe = Get-SteamAppPath '271590' 'GTA5.exe'
  if ($exe) { return $exe }
  foreach ($chave in @('HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V Enhanced', 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V')) {
    try {
      $base = (Get-ItemProperty -LiteralPath $chave -ErrorAction Stop).InstallFolder
      if (-not $base) { continue }
      foreach ($nome in @('GTA5_Enhanced.exe', 'GTA5.exe')) {
        $exe = Join-Path ([string]$base) $nome
        if (Test-Path -LiteralPath $exe) { return $exe }
      }
    } catch {}
  }
  return $null
}

function Get-R6Path {
  $exe = Get-SteamAppPath '359550' 'RainbowSix.exe'
  if ($exe) { return $exe }
  try {
    $base = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\635' -ErrorAction Stop).InstallDir
    if ($base) {
      $exe = Join-Path ([string]$base) 'RainbowSix.exe'
      if (Test-Path -LiteralPath $exe) { return $exe }
    }
  } catch {}
  return $null
}

function Get-ApexPath {
  $exe = Get-SteamAppPath '1172470' 'r5apex.exe'
  if ($exe) { return $exe }
  try {
    $base = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\WOW6432Node\Respawn\Apex' -ErrorAction Stop).'Install Dir'
    if ($base) {
      $exe = Join-Path ([string]$base) 'r5apex.exe'
      if (Test-Path -LiteralPath $exe) { return $exe }
    }
  } catch {}
  return $null
}

function Get-Overwatch2Path {
  $base = Get-UninstallLocation 'Overwatch'
  if ($base) {
    $exe = Join-Path $base '_retail_\Overwatch.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return (Get-SteamAppPath '2357570' '_retail_\Overwatch.exe')
}

function Get-CodPath {
  $exe = Get-SteamAppPath '1938090' 'cod.exe'
  if ($exe) { return $exe }
  $base = Get-UninstallLocation 'Call of Duty'
  if ($base) {
    $exe = Join-Path $base 'cod.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-RobloxPath {
  $base = Get-UninstallLocation 'roblox-player'
  if ($base) {
    $exe = Join-Path $base 'RobloxPlayerBeta.exe'
    if (Test-Path -LiteralPath $exe) { return $exe }
  }
  return $null
}

function Get-GameExe([string]$id) {
  switch ($id) {
    'cs2' { return Get-SteamAppPath '730' 'game\bin\win64\cs2.exe' }
    'lol' { return Get-LeaguePath }
    'fivem' { return Get-FiveMPath }
    'valorant' { return Get-ValorantPath }
    'fortnite' { return Get-EpicAppPath 'Fortnite' 'FortniteGame\Binaries\Win64\FortniteClient-Win64-Shipping.exe' }
    'gta5' { return Get-Gta5Path }
    'rocketleague' {
      $exe = Get-EpicAppPath 'Rocket League' 'Binaries\Win64\RocketLeague.exe'
      if ($exe) { return $exe }
      return Get-SteamAppPath '252950' 'Binaries\Win64\RocketLeague.exe'
    }
    'apex' { return Get-ApexPath }
    'dota2' { return Get-SteamAppPath '570' 'game\bin\win64\dota2.exe' }
    'r6' { return Get-R6Path }
    'overwatch2' { return Get-Overwatch2Path }
    'cod' { return Get-CodPath }
    'pubg' { return Get-SteamAppPath '578080' 'TslGame\Binaries\Win64\TslGame.exe' }
    'roblox' { return Get-RobloxPath }
  }
  return $null
}

function Get-GameCacheDirs([string]$id) {
  $dirs = New-Object 'System.Collections.Generic.List[string]'
  $docs = [Environment]::GetFolderPath('MyDocuments')
  switch ($id) {
    'cs2' {
      foreach ($d in (Get-SteamShaderCache '730')) { $dirs.Add($d) }
    }
    'lol' {
      $exe = Get-LeaguePath
      if ($exe) {
        $base = Split-Path -Parent (Split-Path -Parent $exe)
        $dirs.Add((Join-Path $base 'Logs'))
      }
      $dirs.Add("$env:LOCALAPPDATA\Riot Games\Riot Client\Logs")
    }
    'fivem' {
      $data = "$env:LOCALAPPDATA\FiveM\FiveM.app\data"
      foreach ($nome in @('cache', 'cache_priv', 'server-cache', 'server-cache-priv')) {
        $dirs.Add((Join-Path $data $nome))
      }
    }
    'valorant' {
      $dirs.Add("$env:LOCALAPPDATA\VALORANT\Saved\Logs")
      $dirs.Add("$env:LOCALAPPDATA\VALORANT\Saved\Crashes")
      $dirs.Add("$env:LOCALAPPDATA\Riot Games\VALORANT\Logs")
      $dirs.Add("$env:LOCALAPPDATA\Riot Games\Riot Client\Logs")
      $dirs.Add("$env:LOCALAPPDATA\Riot Games\Riot Client\HttpCache")
      foreach ($web in (Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\VALORANT\Saved" -Directory -Filter 'webcache_*' -ErrorAction SilentlyContinue)) {
        $dirs.Add($web.FullName)
      }
    }
    'fortnite' {
      $dirs.Add("$env:LOCALAPPDATA\FortniteGame\Saved\Logs")
      $dirs.Add("$env:LOCALAPPDATA\FortniteGame\Saved\Crashes")
      $dirs.Add("$env:LOCALAPPDATA\EpicGamesLauncher\Saved\Logs")
      foreach ($web in (Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\EpicGamesLauncher\Saved" -Directory -Filter 'webcache_*' -ErrorAction SilentlyContinue)) {
        $dirs.Add($web.FullName)
      }
    }
    'gta5' {
      $dirs.Add("$env:LOCALAPPDATA\Rockstar Games\Launcher\CrashLogs")
      foreach ($d in (Get-SteamShaderCache '271590')) { $dirs.Add($d) }
      foreach ($d in (Get-SteamShaderCache '3240220')) { $dirs.Add($d) }
    }
    'rocketleague' {
      $dirs.Add((Join-Path $docs 'My Games\Rocket League\TAGame\Cache'))
      $dirs.Add((Join-Path $docs 'My Games\Rocket League\TAGame\Logs'))
    }
    'apex' {
      foreach ($d in (Get-SteamShaderCache '1172470')) { $dirs.Add($d) }
    }
    'dota2' {
      foreach ($d in (Get-SteamShaderCache '570')) { $dirs.Add($d) }
    }
    'r6' {
      $dirs.Add("$env:LOCALAPPDATA\Ubisoft\Rainbow Six - Siege")
      $dirs.Add("$env:LOCALAPPDATA\Ubisoft Game Launcher\cache")
      $dirs.Add("$env:LOCALAPPDATA\Ubisoft Game Launcher\logs")
    }
    'overwatch2' {
      $dirs.Add("$env:ProgramData\Blizzard Entertainment\Battle.net\Cache")
      $dirs.Add((Join-Path $docs 'Overwatch\Logs'))
    }
    'cod' {
      $exe = Get-CodPath
      if ($exe) { $dirs.Add((Join-Path (Split-Path -Parent $exe) 'shadercache')) }
    }
    'pubg' {
      $dirs.Add("$env:LOCALAPPDATA\TslGame\Saved\Logs")
      $dirs.Add("$env:LOCALAPPDATA\TslGame\Saved\Crashes")
      foreach ($d in (Get-SteamShaderCache '578080')) { $dirs.Add($d) }
    }
    'roblox' {
      $dirs.Add("$env:LOCALAPPDATA\Roblox\logs")
      $dirs.Add((Join-Path $env:TEMP 'Roblox'))
    }
  }
  return @($dirs | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ })
}

function Get-GameProcessNames([string]$id) {
  switch ($id) {
    'cs2' { return @('cs2') }
    'lol' { return @('League of Legends') }
    'fivem' { return @('FiveM') }
    'valorant' { return @('VALORANT-Win64-Shipping') }
    'fortnite' { return @('FortniteClient-Win64-Shipping') }
    'gta5' { return @('GTA5', 'GTA5_Enhanced', 'GTA5_BE', 'GTA5_Enhanced_BE') }
    'rocketleague' { return @('RocketLeague') }
    'apex' { return @('r5apex', 'r5apex_dx12') }
    'dota2' { return @('dota2') }
    'r6' { return @('RainbowSix', 'RainbowSix_BE') }
    'overwatch2' { return @('Overwatch') }
    'cod' { return @('cod', 'cod*-cod') }
    'pubg' { return @('TslGame') }
    'roblox' { return @('RobloxPlayerBeta') }
  }
  return @()
}

function Get-GameTuning([string]$id) {
  switch ($id) {
    'cs2' { return 'completo' }
    'dota2' { return 'completo' }
    'fivem' { return 'completo' }
    'cod' { return 'nenhum' }
    'roblox' { return 'nenhum' }
  }
  return 'gpu-tela'
}
