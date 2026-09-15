$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Edição de arquivo de config de jogo. Três regras que valem para tudo aqui:
#   1. só escreve com o jogo e o launcher fechados;
#   2. faz cópia byte-a-byte antes de escrever — sem backup gravado, não escreve;
#   3. só mexe em chave que JÁ existe no arquivo, e só com valor dentro do range
#      que a UI oficial do jogo alcança. Fora disso vira vantagem competitiva,
#      que é onde mora o ban.

$CfgAlvos = @('gta5', 'cs2', 'lol')
$CfgPresets = @('desempenho', 'equilibrado', 'visual')

$CfgDir = Join-Path $env:LOCALAPPDATA 'PLFCore\gameconfig'
$CfgIndice = Join-Path $CfgDir 'gameconfig.json'

function Get-CfgEstado {
  if (Test-Path -LiteralPath $CfgIndice) {
    try { return Get-Content -LiteralPath $CfgIndice -Raw | ConvertFrom-Json } catch {}
  }
  return [pscustomobject]@{ version = 1; jogos = [pscustomobject]@{} }
}

function Save-CfgEstado($estado) {
  New-Item -ItemType Directory -Force -Path $CfgDir | Out-Null
  $tmp = Join-Path $CfgDir ("cfg-{0}-{1}.tmp" -f $PID, [guid]::NewGuid().ToString('N'))
  $estado | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $tmp -Encoding UTF8
  Move-Item -LiteralPath $tmp -Destination $CfgIndice -Force
}

<# Cópia byte-a-byte do original. Só grava uma vez: o backup tem que ser o estado
   de fábrica da pessoa, não o resultado do último preset que o app aplicou. #>
function Save-CfgBackup([string]$id, [string]$arquivo) {
  $destinoDir = Join-Path $CfgDir "backup\$id"
  New-Item -ItemType Directory -Force -Path $destinoDir | Out-Null
  $destino = Join-Path $destinoDir (Split-Path -Leaf $arquivo)
  if (-not (Test-Path -LiteralPath $destino)) {
    Copy-Item -LiteralPath $arquivo -Destination $destino -Force
  }
  return $destino
}

function Test-JogoFechado([string]$id) {
  foreach ($processo in (Get-GameProcessNames $id)) {
    if (Get-Process -Name $processo -ErrorAction SilentlyContinue) { throw 'ERR_GAME_RUNNING' }
  }
}

# ===== GTA V: settings.xml =====

<# A Rockstar publica o range de cada parâmetro no artigo oficial de linha de
   comando; os presets abaixo só andam dentro dele. Nada aqui passa do que o
   menu de gráficos do jogo alcança. #>
$Gta5Presets = @{
  desempenho = @{
    Tessellation = '0'; ShadowQuality = '1'; PostFX = '0'; ReflectionQuality = '0'
    SSAO = '0'; TextureQuality = '1'; ShaderQuality = '1'; WaterQuality = '0'
    ParticleQuality = '0'; GrassQuality = '1'; AnisotropicFiltering = '4'
    Shadow_SoftShadows = '0'; Shadow_ParticleShadows = '0'; Shadow_LongShadows = '0'
    FXAA_Enabled = '1'; TXAA_Enabled = '0'; Lighting_FogVolumes = '0'; Reflection_MipBlur = '0'
    LodScale = '0.500000'; PedLodBias = '0.300000'; VehicleLodBias = '0.300000'; CityDensity = '0.500000'
  }
  equilibrado = @{
    Tessellation = '1'; ShadowQuality = '2'; PostFX = '1'; ReflectionQuality = '1'
    SSAO = '1'; TextureQuality = '2'; ShaderQuality = '1'; WaterQuality = '1'
    ParticleQuality = '1'; GrassQuality = '3'; AnisotropicFiltering = '8'
    Shadow_SoftShadows = '1'; Shadow_ParticleShadows = '0'; Shadow_LongShadows = '1'
    FXAA_Enabled = '1'; TXAA_Enabled = '0'; Lighting_FogVolumes = '1'; Reflection_MipBlur = '0'
    LodScale = '0.700000'; PedLodBias = '0.500000'; VehicleLodBias = '0.500000'; CityDensity = '0.700000'
  }
  visual = @{
    Tessellation = '3'; ShadowQuality = '3'; PostFX = '3'; ReflectionQuality = '3'
    SSAO = '2'; TextureQuality = '2'; ShaderQuality = '2'; WaterQuality = '2'
    ParticleQuality = '2'; GrassQuality = '5'; AnisotropicFiltering = '16'
    Shadow_SoftShadows = '3'; Shadow_ParticleShadows = '1'; Shadow_LongShadows = '1'
    FXAA_Enabled = '1'; TXAA_Enabled = '1'; Lighting_FogVolumes = '1'; Reflection_MipBlur = '1'
    LodScale = '1.000000'; PedLodBias = '1.000000'; VehicleLodBias = '1.000000'; CityDensity = '1.000000'
  }
}

<# Os dois artigos oficiais da Rockstar se contradizem sobre "GTA V" vs "GTAV",
   e o Enhanced usa pasta própria. Enumerar é o único jeito que não quebra. #>
function Get-Gta5SettingsPath {
  $raiz = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Rockstar Games'
  if (-not (Test-Path -LiteralPath $raiz)) { return $null }
  $achados = @(Get-ChildItem -LiteralPath $raiz -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'settings.xml' } |
    Where-Object { Test-Path -LiteralPath $_ })
  if ($achados.Count -eq 0) { return $null }
  return @($achados | Sort-Object { (Get-Item -LiteralPath $_).LastWriteTime } -Descending)[0]
}

function Read-Gta5Settings([string]$arquivo) {
  $xml = [xml](Get-Content -LiteralPath $arquivo -Raw)
  $lidos = @{}
  foreach ($chave in $Gta5Presets.desempenho.Keys) {
    $no = $xml.SelectSingleNode("//$chave")
    if ($no -and $no.Attributes['value']) { $lidos[$chave] = [string]$no.Attributes['value'].Value }
  }
  return $lidos
}

function Write-Gta5Settings([string]$arquivo, [hashtable]$valores) {
  $xml = [xml](Get-Content -LiteralPath $arquivo -Raw)
  $tocados = 0
  foreach ($chave in $valores.Keys) {
    $no = $xml.SelectSingleNode("//$chave")
    # Tag ausente fica ausente: o arquivo do usuário manda, não o nosso preset.
    if ($no -and $no.Attributes['value']) {
      $no.Attributes['value'].Value = [string]$valores[$chave]
      $tocados += 1
    }
  }
  $xml.Save($arquivo)
  return $tocados
}

# ===== CS2: autoexec.cfg =====

$Cs2Marca = '// >>> PLF CORE'
$Cs2Fim = '// <<< PLF CORE'

<# Só cvar cuja string existe nos binários do CS2 de hoje. Metade do que circula
   em "autoexec otimizado" é herança morta do CS:GO e não existe mais. #>
$Cs2Presets = @{
  desempenho = @('fps_max 0', 'fps_max_ui 120', 'r_low_latency 2', 'engine_low_latency_sleep_after_client_tick true')
  equilibrado = @('fps_max 0', 'fps_max_ui 120', 'r_low_latency 1', 'engine_low_latency_sleep_after_client_tick true')
  visual = @('fps_max 0', 'fps_max_ui 60', 'r_low_latency 0')
}

function Get-Cs2AutoexecPath {
  foreach ($raiz in @('HKLM:\SOFTWARE\WOW6432Node\Valve\CS2', 'HKLM:\SOFTWARE\Valve\CS2')) {
    try {
      $inst = (Get-ItemProperty -LiteralPath $raiz -ErrorAction Stop).installpath
      if ($inst -and (Test-Path -LiteralPath $inst)) {
        $cfg = Join-Path $inst 'game\csgo\cfg'
        if (Test-Path -LiteralPath $cfg) { return (Join-Path $cfg 'autoexec.cfg') }
      }
    } catch {}
  }
  return $null
}

<# Bloco delimitado: quem já tem autoexec mantém o dele inteiro. Reaplicar troca
   só o miolo entre as marcas. #>
function Write-Cs2Autoexec([string]$arquivo, [string[]]$linhas) {
  $atual = if (Test-Path -LiteralPath $arquivo) { @(Get-Content -LiteralPath $arquivo) } else { @() }
  $fora = New-Object System.Collections.Generic.List[string]
  $dentro = $false
  foreach ($linha in $atual) {
    if ($linha.StartsWith($Cs2Marca)) { $dentro = $true; continue }
    if ($linha.StartsWith($Cs2Fim)) { $dentro = $false; continue }
    if (-not $dentro) { $fora.Add($linha) }
  }
  while ($fora.Count -gt 0 -and [string]::IsNullOrWhiteSpace($fora[$fora.Count - 1])) {
    $fora.RemoveAt($fora.Count - 1)
  }
  $saida = New-Object System.Collections.Generic.List[string]
  foreach ($linha in $fora) { $saida.Add($linha) }
  if ($saida.Count -gt 0) { $saida.Add('') }
  $saida.Add($Cs2Marca)
  foreach ($linha in $linhas) { $saida.Add($linha) }
  $saida.Add($Cs2Fim)
  Set-Content -LiteralPath $arquivo -Value $saida.ToArray() -Encoding ASCII
  return $linhas.Count
}

function Read-Cs2Autoexec([string]$arquivo) {
  if (-not (Test-Path -LiteralPath $arquivo)) { return @{} }
  $lidos = @{}
  $dentro = $false
  foreach ($linha in @(Get-Content -LiteralPath $arquivo)) {
    if ($linha.StartsWith($Cs2Marca)) { $dentro = $true; continue }
    if ($linha.StartsWith($Cs2Fim)) { $dentro = $false; continue }
    if ($dentro) {
      $partes = ([string]$linha).Trim() -split '\s+', 2
      if ($partes.Count -eq 2) { $lidos[$partes[0]] = $partes[1] }
    }
  }
  return $lidos
}

# ===== LoL: game.cfg =====

<# A Riot não documenta a semântica de FrameCapType nem a escala de ShadowQuality,
   e nenhuma fonte confiável confirma. Sem isso, preset seria número inventado —
   então aqui o "perfil" é snapshot: guarda o que a pessoa configurou na UI do
   jogo e devolve depois. Nada é gerado por nós. #>
function Get-LolConfigPath {
  $exe = Get-GameExe 'lol'
  if (-not $exe) { return $null }
  $cfg = Join-Path (Split-Path -Parent $exe) 'Config\game.cfg'
  if (Test-Path -LiteralPath $cfg) { return $cfg }
  foreach ($raiz in @('C:\Riot Games\League of Legends')) {
    $alt = Join-Path $raiz 'Config\game.cfg'
    if (Test-Path -LiteralPath $alt) { return $alt }
  }
  return $null
}

function Read-IniSimples([string]$arquivo) {
  $lidos = @{}
  $secao = ''
  foreach ($linha in @(Get-Content -LiteralPath $arquivo)) {
    $t = ([string]$linha).Trim()
    if ($t.StartsWith('[') -and $t.EndsWith(']')) { $secao = $t.Trim('[', ']'); continue }
    $igual = $t.IndexOf('=')
    if ($igual -gt 0) { $lidos["$secao.$($t.Substring(0, $igual).Trim())"] = $t.Substring($igual + 1).Trim() }
  }
  return $lidos
}

# ===== despacho =====

function Get-CfgArquivo([string]$id) {
  switch ($id) {
    'gta5' { return Get-Gta5SettingsPath }
    'cs2' { return Get-Cs2AutoexecPath }
    'lol' { return Get-LolConfigPath }
  }
  return $null
}

function Read-CfgValores([string]$id, [string]$arquivo) {
  switch ($id) {
    'gta5' { return Read-Gta5Settings $arquivo }
    'cs2' { return Read-Cs2Autoexec $arquivo }
    'lol' { return Read-IniSimples $arquivo }
  }
  return @{}
}

$acao = $env:PLFCORE_GAMECFG_ACTION

if ($acao -eq 'scan') {
  $estado = Get-CfgEstado
  $itens = foreach ($id in $CfgAlvos) {
    $arquivo = Get-CfgArquivo $id
    $registro = $estado.jogos.$id
    $valores = @{}
    if ($arquivo) {
      try { $valores = Read-CfgValores $id $arquivo } catch { $valores = @{} }
    }
    $pares = foreach ($chave in ($valores.Keys | Sort-Object)) {
      [pscustomobject]@{ chave = [string]$chave; valor = [string]$valores[$chave] }
    }
    [pscustomobject]@{
      id = $id
      # cs2 é o único que aceita arquivo inexistente: o autoexec.cfg não vem por padrão
      disponivel = [bool]($arquivo -and ($id -eq 'cs2' -or (Test-Path -LiteralPath $arquivo)))
      arquivo = $arquivo
      # snapshot = perfil salvo pelo usuário; preset = valores nossos, com range oficial
      modo = if ($id -eq 'lol') { 'snapshot' } else { 'preset' }
      presetAtual = if ($registro) { [string]$registro.preset } else { $null }
      temBackup = [bool]($registro -and $registro.backup -and (Test-Path -LiteralPath ([string]$registro.backup)))
      valores = @($pares)
    }
  }
  [pscustomobject]@{ items = @($itens); origin = 'measured' } | ConvertTo-Json -Depth 5 -Compress
  exit 0
}

if ($acao -eq 'apply') {
  $id = $env:PLFCORE_GAMECFG_ID
  $preset = $env:PLFCORE_GAMECFG_PRESET
  if ($CfgAlvos -notcontains $id) { throw 'ERR_CFG_NOT_ALLOWED' }
  if ($id -ne 'lol' -and $CfgPresets -notcontains $preset) { throw 'ERR_CFG_PRESET' }
  Test-JogoFechado $id

  $arquivo = Get-CfgArquivo $id
  if (-not $arquivo) { throw 'ERR_CFG_NOT_FOUND' }
  if ($id -eq 'cs2' -and -not (Test-Path -LiteralPath $arquivo)) {
    Set-Content -LiteralPath $arquivo -Value @() -Encoding ASCII
  }
  if (-not (Test-Path -LiteralPath $arquivo)) { throw 'ERR_CFG_NOT_FOUND' }

  $backup = Save-CfgBackup $id $arquivo
  if (-not (Test-Path -LiteralPath $backup)) { throw 'ERR_CFG_BACKUP' }

  $tocados = 0
  if ($id -eq 'gta5') {
    $tocados = Write-Gta5Settings $arquivo $Gta5Presets[$preset]
  } elseif ($id -eq 'cs2') {
    $tocados = Write-Cs2Autoexec $arquivo $Cs2Presets[$preset]
  } else {
    # snapshot: o "aplicar" do LoL é só carimbar o backup do estado atual
    $preset = 'snapshot'
  }

  $estado = Get-CfgEstado
  $estado.jogos | Add-Member -NotePropertyName $id -NotePropertyValue ([pscustomobject]@{
    arquivo = $arquivo; backup = $backup; preset = $preset
  }) -Force
  Save-CfgEstado $estado

  [pscustomobject]@{ id = $id; preset = $preset; arquivo = $arquivo; camposTocados = $tocados; origin = 'measured' } |
    ConvertTo-Json -Compress
  exit 0
}

if ($acao -eq 'restore') {
  $id = $env:PLFCORE_GAMECFG_ID
  if ($CfgAlvos -notcontains $id) { throw 'ERR_CFG_NOT_ALLOWED' }
  Test-JogoFechado $id

  $estado = Get-CfgEstado
  $registro = $estado.jogos.$id
  if (-not $registro -or -not $registro.backup) { throw 'ERR_CFG_NO_BACKUP' }
  $backup = [string]$registro.backup
  $arquivo = [string]$registro.arquivo
  if (-not (Test-Path -LiteralPath $backup)) { throw 'ERR_CFG_NO_BACKUP' }

  Copy-Item -LiteralPath $backup -Destination $arquivo -Force
  $estado.jogos.PSObject.Properties.Remove($id)
  Save-CfgEstado $estado

  [pscustomobject]@{ id = $id; arquivo = $arquivo; origin = 'measured' } | ConvertTo-Json -Compress
  exit 0
}

throw 'ERR_CFG_ACTION'
