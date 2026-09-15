// Comandos nativos do RESYNC.
// Regras: PowerShell só com script FIXO (lista branca, sem concatenação de input),
// timeout em tudo, limpeza restrita a diretórios seguros conhecidos, kill com lista de negação.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{LazyLock, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, System};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

// Scripts PowerShell cifrados no build (ver build.rs): `strings resync.exe`
// não revela nada; decifra em memória no primeiro uso.
include!(concat!(env!("OUT_DIR"), "/ps_enc.rs"));

static INVENTORY_PS: LazyLock<String> =
    LazyLock::new(|| ps_decode(&[ENC_PERIPHERALS, ENC_INVENTORY]));
static APPLY_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_GAMEPATHS, ENC_APPLY]));
static DEBLOAT_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_DEBLOAT]));
static GAMES_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_GAMEPATHS, ENC_GAMES]));
static GAMECONFIG_PS: LazyLock<String> =
    LazyLock::new(|| ps_decode(&[ENC_GAMEPATHS, ENC_GAMECONFIG]));
static FIVEM_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_FIVEM]));
/// Só jogo cujo arquivo de config e range de valores estão confirmados.
const GAMECONFIG_ALLOWLIST: [&str; 3] = ["gta5", "cs2", "lol"];
const GAMECONFIG_PRESETS: [&str; 3] = ["desempenho", "equilibrado", "visual"];
/// Pastas que o pure mode inspeciona — as únicas que o app pode isolar.
const FIVEM_FOLDERS: [&str; 3] = ["mods", "plugins", "addons"];
const GAMES_ALLOWLIST: [&str; 14] = [
    "cs2",
    "lol",
    "fivem",
    "valorant",
    "fortnite",
    "gta5",
    "rocketleague",
    "apex",
    "dota2",
    "r6",
    "overwatch2",
    "cod",
    "pubg",
    "roblox",
];
/// Jogos com anti-cheat de kernel não recebem IFEO; cod/roblox nem ajuste por exe
/// (o executável real muda a cada versão). Só estes viram perfil jogo-*.
const GAMES_TUNABLE: [&str; 12] = [
    "cs2",
    "lol",
    "fivem",
    "valorant",
    "fortnite",
    "gta5",
    "rocketleague",
    "apex",
    "dota2",
    "r6",
    "overwatch2",
    "pubg",
];
static INPUT_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_PERIPHERALS, ENC_INPUT]));
static STARTUP_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_STARTUP]));
static TWEAKS_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_TWEAKS]));
static FPSBOOST_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_FPSBOOST]));
static RUNTIMES_PS: LazyLock<String> = LazyLock::new(|| ps_decode(&[ENC_RUNTIMES]));
const RUNTIMES_ALLOWLIST: &[&str] = &[
    "vc2015-x64",
    "vc2015-x86",
    "vc2013-x64",
    "vc2013-x86",
    "vc2012-x64",
    "vc2012-x86",
    "vc2010-x64",
    "vc2010-x86",
    "vc2008-x64",
    "vc2008-x86",
    "vc2005-x64",
    "vc2005-x86",
    "directx",
    "dotnet-desktop-8",
    "dotnet-desktop-9",
    "xna",
    "netfx",
];
const STARTUP_SOURCES: [&str; 5] = [
    "hkcu-run",
    "hklm-run",
    "hklm-run32",
    "pasta-usuario",
    "pasta-comum",
];
const TWEAKS_ALLOWLIST: &[&str] = &[
    "anuncio-id-off",
    "experiencias-personalizadas-off",
    "feedback-off",
    "historico-atividades-off",
    "telemetria-minima",
    "digitacao-voz-off",
    "localizacao-off",
    "telemetria-edge-off",
    "relatorio-erros-off",
    "autologger-off",
    "telemetria-driver-off",
    "tarefas-diagnostico-off",
    "sugestoes-menu-off",
    "copilot-off",
    "widgets-off",
    "busca-bing-off",
    "visual-cru",
    "miniaturas-off",
    "fonte-crua",
    "gamebar-off",
    "tela-cheia-classica",
    "flip-model-on",
    "mpo-off",
    "teclas-aderencia-off",
    "delivery-p2p-off",
    "llmnr-off",
    "netbios-off",
    "nic-energia-off",
    "dns-rapido",
    "hibernacao-off",
    "dump-minidump",
    "fth-off",
    "indexacao-off",
    "spooler-off",
    "acesso-remoto-off",
    "xbox-servicos-off",
    "manutencao-automatica-off",
    "ultimo-acesso-off",
    "prioridade-primeiro-plano",
    "msconfig-limites-off",
    "rsc-off",
    "vbs-off",
];
const FPSBOOST_ALLOWLIST: &[&str] = &[
    "mmcss-perfil-jogo",
    "mmcss-sem-lazy",
    "game-dvr-total-off",
    "game-mode-on",
    "gpu-agendamento-hardware",
    "gpu-preempcao-off",
    "energia-sem-throttle",
    "energia-sem-estimativa",
    "cpu-idle-off",
    "memoria-kernel-residente",
    "svchost-agrupado",
    "prefetch-superfetch-off",
    "disco-sem-economia",
    "disco-sem-idle-storport",
    "rede-tcp-imediato",
    "medicao-rede-off",
    "mouse-1-para-1",
    "teclado-resposta-maxima",
    "acessibilidade-off",
    "usb-suspensao-off",
    "interface-sem-espera",
    "mitigacoes-cpu-off",
];
const PS_TIMEOUT: Duration = Duration::from_secs(90);
const DEBLOAT_TIMEOUT: Duration = Duration::from_secs(180);

const DEBLOAT_ALLOWLIST: &[&str] = &[
    "quick-assist",
    "feedback-hub",
    "copilot",
    "weather",
    "family",
    "office-hub",
    "bing-search",
    "clipchamp",
    "teams",
    "todo",
    "bing-news",
    "outlook",
    "alarms",
    "solitaire",
    "power-automate",
    "dev-home",
    "get-help",
    "get-started",
    "sticky-notes",
    "camera",
    "sound-recorder",
    "snipping-tool",
    "onedrive",
    "xbox-suite",
    "phone-link",
    "maps",
    "people",
    "mixed-reality",
    "mail-calendar",
    "movies-tv",
    "media-player",
];

/// Caminho absoluto do Windows PowerShell — não depende do PATH do usuário.
fn powershell_path() -> String {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    format!("{root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")
}

/// Processos que NUNCA podem ser encerrados por aqui.
const KILL_DENY: &[&str] = &[
    "system",
    "registry",
    "idle",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "dwm.exe",
    "explorer.exe",
    "taskhostw.exe",
    "runtimebroker.exe",
    "sihost.exe",
    "ctfmon.exe",
    "conhost.exe",
    "openconsole.exe",
    "dllhost.exe",
    "audiodg.exe",
    "spoolsv.exe",
    "searchhost.exe",
    "searchindexer.exe",
    "startmenuexperiencehost.exe",
    "shellexperiencehost.exe",
    "securityhealthservice.exe",
    "securityhealthsystray.exe",
    "msmpeng.exe",
    "wudfhost.exe",
    "fontdrvhost.exe",
    "memcompression",
    "resync.exe",
];

/// `refresh_processes` não traz o dono do processo; sem ele o filtro de sessão
/// ficaria inerte e serviço do SYSTEM voltaria pra lista.
fn atualizar_alvos(sys: &mut System) {
    sys.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        true,
        sysinfo::ProcessRefreshKind::nothing()
            .with_memory()
            .with_user(sysinfo::UpdateKind::OnlyIfNotSet),
    );
}

/// SID do usuário logado. Serviço, driver e tarefa do SYSTEM rodam com outro
/// dono — encerrar um deles trava ou desliga a máquina, então nem aparecem.
fn dono_da_sessao(sys: &System) -> Option<sysinfo::Uid> {
    sys.process(Pid::from_u32(std::process::id()))?
        .user_id()
        .cloned()
}

fn alvo_permitido(p: &sysinfo::Process, dono: Option<&sysinfo::Uid>) -> bool {
    if KILL_DENY.contains(&p.name().to_string_lossy().to_lowercase().as_str()) {
        return false;
    }
    match dono {
        Some(uid) => p.user_id() == Some(uid),
        None => true,
    }
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Base64 de UTF-16LE — formato exigido por `powershell -EncodedCommand`.
fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script
        .encode_utf16()
        .flat_map(|u| u.to_le_bytes())
        .collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            B64[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            B64[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

/// Executa um script FIXO (lista branca) no PowerShell.
/// `-EncodedCommand` e não `-Command -`: pelo stdin o PowerShell interpreta linha a
/// linha e blocos multi-linha (funções, if/else) são truncados — a saída volta vazia.
/// Scripts grandes vão por arquivo temporário (`-File`): o argumento codificado
/// estoura o limite de linha de comando do Windows.
fn run_powershell(script: &str, timeout: Duration) -> Result<String, String> {
    run_powershell_env(script, timeout, &[])
}

fn run_powershell_env(
    script: &str,
    timeout: Duration,
    envs: &[(&str, &str)],
) -> Result<String, String> {
    let encoded = encode_command(script);
    let arquivo = if encoded.len() > 7000 {
        // nome único por chamada: execuções concorrentes não podem disputar o mesmo arquivo
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let caminho = std::env::temp_dir().join(format!(
            "resync-{}-{}-{n}.ps1",
            std::process::id(),
            agora_ms()
        ));
        // BOM UTF-8: sem ele o PowerShell 5.1 lê acentos como ANSI
        let mut conteudo = vec![0xEF, 0xBB, 0xBF];
        conteudo.extend_from_slice(script.as_bytes());
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&caminho)
            .map_err(|e| format!("ERR_PS_TMP:{e}"))?;
        if let Err(e) = file.write_all(&conteudo) {
            let _ = std::fs::remove_file(&caminho);
            return Err(format!("ERR_PS_TMP:{e}"));
        }
        Some(caminho)
    } else {
        None
    };

    let mut cmd = Command::new(powershell_path());
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
    ]);
    for (key, value) in envs {
        cmd.env(key, value);
    }
    match &arquivo {
        Some(p) => {
            cmd.arg("-File").arg(p);
        }
        None => {
            cmd.arg("-EncodedCommand").arg(&encoded);
        }
    }

    let spawn = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
    let mut child = match spawn {
        Ok(child) => child,
        Err(e) => {
            if let Some(p) = &arquivo {
                let _ = std::fs::remove_file(p);
            }
            return Err(format!("ERR_PS_SPAWN:{e}"));
        }
    };

    // stderr precisa ser drenado em paralelo: se o pipe encher, o PowerShell trava.
    // Leitura em BYTES + decodificação tolerante: read_to_string zera tudo se o
    // console emitir codepage OEM (acentos fora de UTF-8).
    let mut errpipe = child.stderr.take();
    let (etx, erx) = mpsc::channel::<String>();
    thread::spawn(move || {
        let mut e = Vec::new();
        if let Some(p) = errpipe.as_mut() {
            let _ = p.read_to_end(&mut e);
        }
        let _ = etx.send(String::from_utf8_lossy(&e).into_owned());
    });

    let mut stdout = match child.stdout.take() {
        Some(pipe) => pipe,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            if let Some(p) = &arquivo {
                let _ = std::fs::remove_file(p);
            }
            return Err("ERR_PS_STDOUT".into());
        }
    };
    let (tx, rx) = mpsc::channel::<String>();
    thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.read_to_end(&mut out);
        let _ = tx.send(String::from_utf8_lossy(&out).into_owned());
    });

    let resultado = match rx.recv_timeout(timeout) {
        Ok(out) => match child.wait() {
            Ok(status) => {
                let erro = erx.recv_timeout(Duration::from_secs(2)).unwrap_or_default();
                let resumo = erro
                    .split_whitespace()
                    .take(40)
                    .collect::<Vec<_>>()
                    .join(" ");
                if !status.success() {
                    Err(format!("ERR_PS_EXIT:{resumo}"))
                } else if out.trim().is_empty() {
                    Err(format!("ERR_PS_EMPTY:{resumo}"))
                } else {
                    Ok(out)
                }
            }
            Err(e) => Err(format!("ERR_PS_WAIT:{e}")),
        },
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err("ERR_PS_TIMEOUT".into())
        }
    };

    if let Some(p) = arquivo {
        let _ = std::fs::remove_file(p);
    }
    resultado
}

fn inventory_cache() -> &'static Mutex<Option<Value>> {
    static CACHE: OnceLock<Mutex<Option<Value>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn collect_inventory() -> Result<Value, String> {
    if let Some(v) = inventory_cache().lock().unwrap().clone() {
        return Ok(v);
    }
    let out = run_powershell(&INVENTORY_PS, PS_TIMEOUT)?;
    let json_start = out.find('{').ok_or("ERR_PS_EMPTY")?;
    let v: Value =
        serde_json::from_str(out[json_start..].trim()).map_err(|e| format!("ERR_PS_PARSE:{e}"))?;
    *inventory_cache().lock().unwrap() = Some(v.clone());
    Ok(v)
}

/// Abre uma página do site no navegador padrão. O caminho vem de lista fechada:
/// nada que venha da interface entra na linha de comando.
#[tauri::command]
pub fn open_site(page: String) -> Result<(), String> {
    let path = match page.as_str() {
        "planos" => "/#planos",
        "painel" => "/painel/licenca",
        "download" => "/download",
        _ => return Err("ERR_SITE_PAGE".into()),
    };
    let url = format!("{}{}", crate::license::site_base(), path);
    Command::new("explorer.exe")
        .arg(&url)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("ERR_SITE_OPEN:{e}"))?;
    Ok(())
}

/// Elevação: `whoami /groups` traz o SID S-1-5-32-544 (Administradores) só quando o
/// token está elevado. Barato e sem dependência extra de winapi.
#[tauri::command]
pub async fn is_elevated() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        run_powershell(
            "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
            Duration::from_secs(15),
        )
        .map(|s| s.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// Reabre o próprio executável elevado (dispara o UAC) e encerra a instância atual.
#[tauri::command]
pub fn relaunch_elevated(app: AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("ERR_EXE_PATH:{e}"))?;
    let exe = exe.to_string_lossy().replace('\'', "''");
    let script = format!("Start-Process -FilePath '{exe}' -Verb RunAs");
    Command::new(powershell_path())
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("ERR_ELEVATE:{e}"))?;
    // dá tempo do UAC aparecer antes de fechar esta instância
    let handle = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1200));
        handle.exit(0);
    });
    Ok(())
}

#[tauri::command]
pub async fn get_inventory() -> Result<Value, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| collect_inventory().map(|v| v["inventory"].clone()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_machine_record() -> Result<Value, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| collect_inventory().map(|v| v["machineRecord"].clone()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_latency_info() -> Result<Value, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell(&INPUT_PS, Duration::from_secs(20))?;
        let start = out
            .find('[')
            .or_else(|| out.find('{'))
            .ok_or("ERR_PS_EMPTY")?;
        let parsed: Value =
            serde_json::from_str(out[start..].trim()).map_err(|e| format!("ERR_PS_PARSE:{e}"))?;
        Ok(if parsed.is_array() {
            parsed
        } else {
            Value::Array(vec![parsed])
        })
    })
    .await
    .map_err(|e| format!("ERR_INPUT_JOIN:{e}"))?
}

fn optimization_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn optimization_profile_allowed(profile: &str) -> bool {
    matches!(
        profile,
        "autonomo"
            | "forcado"
            | "customizado-0"
            | "customizado-25"
            | "customizado-50"
            | "customizado-75"
            | "customizado-100"
            | "reduzir-gargalo"
            | "boost-seguro"
            | "input-reduct-mouse"
            | "input-reduct-teclado"
            | "level-5"
            | "level-4"
            | "level-3"
            | "level-2"
            | "level-1"
    ) || profile
        .strip_prefix("jogo-")
        .is_some_and(|id| GAMES_TUNABLE.contains(&id))
}

#[derive(Deserialize)]
struct ApplyScriptResult {
    aplicados: Vec<String>,
    #[serde(rename = "planoEnergia", default)]
    power_plan: Option<String>,
    #[serde(rename = "desempenhoVerificado", default)]
    performance_verified: bool,
    #[serde(rename = "reinicioRecomendado", default)]
    restart_recommended: bool,
    origin: String,
}

#[derive(Deserialize)]
struct RevertScriptResult {
    revertidos: Vec<String>,
    origin: String,
}

#[derive(Serialize)]
pub struct OptimizationResult {
    #[serde(rename = "profileId")]
    profile_id: String,
    #[serde(rename = "alteracoesIds")]
    alteracoes_ids: Vec<String>,
    #[serde(rename = "powerPlan")]
    power_plan: Option<String>,
    #[serde(rename = "performanceVerified")]
    performance_verified: bool,
    #[serde(rename = "restartRecommended")]
    restart_recommended: bool,
    origin: String,
}

fn parse_script_json<T: for<'de> Deserialize<'de>>(out: &str) -> Result<T, String> {
    let start = out.find('{').ok_or("ERR_PS_EMPTY")?;
    serde_json::from_str(out[start..].trim()).map_err(|e| format!("ERR_PS_PARSE:{e}"))
}

#[derive(Clone, Deserialize, Serialize)]
pub struct DebloatScanItem {
    id: String,
    installed: bool,
}

#[derive(Deserialize)]
struct DebloatScanScriptResult {
    items: Vec<DebloatScanItem>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
pub struct DebloatRestoreResult {
    created: bool,
    message: Option<String>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
pub struct DebloatItemResult {
    id: String,
    status: String,
    #[serde(rename = "errorCode")]
    error_code: Option<String>,
}

fn debloat_id_allowed(id: &str) -> bool {
    DEBLOAT_ALLOWLIST.contains(&id)
}

#[tauri::command]
pub async fn scan_debloat() -> Result<Vec<DebloatScanItem>, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &DEBLOAT_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_DEBLOAT_ACTION", "scan"),
                ("RESYNC_DEBLOAT_ID", ""),
            ],
        )?;
        let parsed: DebloatScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed
                .items
                .iter()
                .any(|item| !debloat_id_allowed(&item.id))
        {
            return Err("ERR_DEBLOAT_ORIGIN".into());
        }
        Ok(parsed.items)
    })
    .await
    .map_err(|e| format!("ERR_DEBLOAT_JOIN:{e}"))?
}

#[tauri::command]
pub async fn prepare_debloat_restore() -> Result<DebloatRestoreResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &DEBLOAT_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_DEBLOAT_ACTION", "restore"),
                ("RESYNC_DEBLOAT_ID", ""),
            ],
        )?;
        let parsed: DebloatRestoreResult = parse_script_json(&out)?;
        if parsed.origin != "measured" {
            return Err("ERR_DEBLOAT_ORIGIN".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_DEBLOAT_JOIN:{e}"))?
}

#[tauri::command]
pub async fn remove_debloat_item(id: String) -> Result<DebloatItemResult, String> {
    crate::license::ensure_licensed()?;
    if !debloat_id_allowed(&id) {
        return Err("ERR_DEBLOAT_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &DEBLOAT_PS,
            DEBLOAT_TIMEOUT,
            &[
                ("RESYNC_DEBLOAT_ACTION", "remove"),
                ("RESYNC_DEBLOAT_ID", id.as_str()),
            ],
        )?;
        let parsed: DebloatItemResult = parse_script_json(&out)?;
        if parsed.id != id
            || !matches!(
                parsed.status.as_str(),
                "removed" | "not-installed" | "failed"
            )
        {
            return Err("ERR_DEBLOAT_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_DEBLOAT_JOIN:{e}"))?
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameScanItem {
    id: String,
    instalado: bool,
    caminho: Option<String>,
    tuning: String,
    cache_bytes: u64,
    cache_pastas: u32,
    gpu_alta: bool,
    tela_cheia_direta: bool,
    prioridade_alta: bool,
}

#[derive(Deserialize)]
struct GameScanScriptResult {
    items: Vec<GameScanItem>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCacheResult {
    id: String,
    liberado_bytes: u64,
    pastas: u32,
    falhas: u32,
    origin: String,
}

fn game_id_allowed(id: &str) -> bool {
    GAMES_ALLOWLIST.contains(&id)
}

#[tauri::command]
pub async fn scan_games() -> Result<Vec<GameScanItem>, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &GAMES_PS,
            PS_TIMEOUT,
            &[("RESYNC_GAMES_ACTION", "scan"), ("RESYNC_GAMES_ID", "")],
        )?;
        let parsed: GameScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured" || parsed.items.iter().any(|item| !game_id_allowed(&item.id))
        {
            return Err("ERR_GAMES_ORIGIN".into());
        }
        Ok(parsed.items)
    })
    .await
    .map_err(|e| format!("ERR_GAMES_JOIN:{e}"))?
}

#[tauri::command]
pub async fn clean_game_cache(id: String) -> Result<GameCacheResult, String> {
    crate::license::ensure_licensed()?;
    if !game_id_allowed(&id) {
        return Err("ERR_GAME_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &GAMES_PS,
            DEBLOAT_TIMEOUT,
            &[
                ("RESYNC_GAMES_ACTION", "clean"),
                ("RESYNC_GAMES_ID", id.as_str()),
            ],
        )?;
        let parsed: GameCacheResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_GAMES_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_GAMES_JOIN:{e}"))?
}

/* ===== config por jogo ===== */

#[derive(Clone, Deserialize, Serialize)]
pub struct GameConfigPair {
    chave: String,
    valor: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigItem {
    id: String,
    disponivel: bool,
    arquivo: Option<String>,
    /// `preset` = valores nossos, com range oficial; `snapshot` = cópia do que o
    /// usuário configurou na UI do jogo, porque a semântica não é documentada.
    modo: String,
    preset_atual: Option<String>,
    tem_backup: bool,
    valores: Vec<GameConfigPair>,
}

#[derive(Deserialize)]
struct GameConfigScanResult {
    items: Vec<GameConfigItem>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigApplyResult {
    id: String,
    preset: String,
    arquivo: String,
    campos_tocados: u32,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigRestoreResult {
    id: String,
    arquivo: String,
    origin: String,
}

fn game_config_allowed(id: &str) -> bool {
    GAMECONFIG_ALLOWLIST.contains(&id)
}

fn game_preset_allowed(preset: &str) -> bool {
    GAMECONFIG_PRESETS.contains(&preset)
}

#[tauri::command]
pub async fn scan_game_configs() -> Result<Vec<GameConfigItem>, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &GAMECONFIG_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_GAMECFG_ACTION", "scan"),
                ("RESYNC_GAMECFG_ID", ""),
                ("RESYNC_GAMECFG_PRESET", ""),
            ],
        )?;
        let parsed: GameConfigScanResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed
                .items
                .iter()
                .any(|item| !game_config_allowed(&item.id))
        {
            return Err("ERR_CFG_ORIGIN".into());
        }
        Ok(parsed.items)
    })
    .await
    .map_err(|e| format!("ERR_CFG_JOIN:{e}"))?
}

#[tauri::command]
pub async fn apply_game_config(id: String, preset: String) -> Result<GameConfigApplyResult, String> {
    crate::license::ensure_licensed()?;
    if !game_config_allowed(&id) {
        return Err("ERR_CFG_NOT_ALLOWED".into());
    }
    // O LoL é snapshot: não tem preset nosso pra validar.
    if id != "lol" && !game_preset_allowed(&preset) {
        return Err("ERR_CFG_PRESET".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &GAMECONFIG_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_GAMECFG_ACTION", "apply"),
                ("RESYNC_GAMECFG_ID", id.as_str()),
                ("RESYNC_GAMECFG_PRESET", preset.as_str()),
            ],
        )?;
        let parsed: GameConfigApplyResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_CFG_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_CFG_JOIN:{e}"))?
}

#[tauri::command]
pub async fn restore_game_config(id: String) -> Result<GameConfigRestoreResult, String> {
    crate::license::ensure_licensed()?;
    if !game_config_allowed(&id) {
        return Err("ERR_CFG_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &GAMECONFIG_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_GAMECFG_ACTION", "restore"),
                ("RESYNC_GAMECFG_ID", id.as_str()),
                ("RESYNC_GAMECFG_PRESET", ""),
            ],
        )?;
        let parsed: GameConfigRestoreResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_CFG_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_CFG_JOIN:{e}"))?
}

/* ===== FiveM ===== */

#[derive(Clone, Deserialize, Serialize)]
pub struct FiveMCache {
    id: String,
    caminho: String,
    existe: bool,
    bytes: u64,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct FiveMMod {
    id: String,
    caminho: String,
    arquivos: u32,
    bytes: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiveMScan {
    instalado: bool,
    versao: Option<String>,
    canal: Option<String>,
    dump_completo: bool,
    config_cliente: Option<String>,
    config_graficos: Option<String>,
    caches: Vec<FiveMCache>,
    mods: Vec<FiveMMod>,
    backup: String,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiveMCleanResult {
    liberado_bytes: u64,
    pastas: u32,
    falhas: u32,
    origin: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FiveMIsolateResult {
    pasta: String,
    movidos: u32,
    falhas: u32,
    destino: String,
    origin: String,
}

fn fivem_folder_allowed(pasta: &str) -> bool {
    FIVEM_FOLDERS.contains(&pasta)
}

#[tauri::command]
pub async fn scan_fivem() -> Result<FiveMScan, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &FIVEM_PS,
            DEBLOAT_TIMEOUT,
            &[("RESYNC_FIVEM_ACTION", "scan"), ("RESYNC_FIVEM_PASTA", "")],
        )?;
        let parsed: FiveMScan = parse_script_json(&out)?;
        if parsed.origin != "measured" {
            return Err("ERR_FIVEM_ORIGIN".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_FIVEM_JOIN:{e}"))?
}

#[tauri::command]
pub async fn clean_fivem_cache() -> Result<FiveMCleanResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &FIVEM_PS,
            DEBLOAT_TIMEOUT,
            &[("RESYNC_FIVEM_ACTION", "clean"), ("RESYNC_FIVEM_PASTA", "")],
        )?;
        let parsed: FiveMCleanResult = parse_script_json(&out)?;
        if parsed.origin != "measured" {
            return Err("ERR_FIVEM_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_FIVEM_JOIN:{e}"))?
}

#[tauri::command]
pub async fn isolate_fivem_folder(pasta: String) -> Result<FiveMIsolateResult, String> {
    crate::license::ensure_licensed()?;
    if !fivem_folder_allowed(&pasta) {
        return Err("ERR_FIVEM_FOLDER".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &FIVEM_PS,
            DEBLOAT_TIMEOUT,
            &[
                ("RESYNC_FIVEM_ACTION", "isolar"),
                ("RESYNC_FIVEM_PASTA", pasta.as_str()),
            ],
        )?;
        let parsed: FiveMIsolateResult = parse_script_json(&out)?;
        if parsed.pasta != pasta || parsed.origin != "measured" {
            return Err("ERR_FIVEM_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_FIVEM_JOIN:{e}"))?
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupItem {
    id: String,
    nome: String,
    comando: String,
    origem_id: String,
    ativado: bool,
    precisa_admin: bool,
    protegido: bool,
}

#[derive(Deserialize)]
struct StartupScanScriptResult {
    items: Vec<StartupItem>,
    origin: String,
}

#[derive(Deserialize, Serialize)]
pub struct StartupToggleResult {
    id: String,
    ativado: bool,
    origin: String,
}

/// O id carrega o nome da entrada (dado do usuário): o script só o usa como nome
/// de valor de registro/arquivo, nunca como código — aqui basta barrar lixo.
fn startup_id_valid(id: &str) -> bool {
    if id.len() > 300 || id.chars().any(|c| c.is_control()) {
        return false;
    }
    let Some((origem, nome)) = id.split_once('|') else {
        return false;
    };
    STARTUP_SOURCES.contains(&origem) && !nome.is_empty()
}

#[tauri::command]
pub async fn scan_startup() -> Result<Vec<StartupItem>, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &STARTUP_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_STARTUP_ACTION", "scan"),
                ("RESYNC_STARTUP_ID", ""),
                ("RESYNC_STARTUP_STATE", ""),
            ],
        )?;
        let parsed: StartupScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed.items.iter().any(|item| !startup_id_valid(&item.id))
        {
            return Err("ERR_STARTUP_ORIGIN".into());
        }
        Ok(parsed.items)
    })
    .await
    .map_err(|e| format!("ERR_STARTUP_JOIN:{e}"))?
}

#[tauri::command]
pub async fn toggle_startup(id: String, ativar: bool) -> Result<StartupToggleResult, String> {
    crate::license::ensure_licensed()?;
    if !startup_id_valid(&id) {
        return Err("ERR_STARTUP_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &STARTUP_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_STARTUP_ACTION", "toggle"),
                ("RESYNC_STARTUP_ID", id.as_str()),
                ("RESYNC_STARTUP_STATE", if ativar { "on" } else { "off" }),
            ],
        )?;
        let parsed: StartupToggleResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" || parsed.ativado != ativar {
            return Err("ERR_STARTUP_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_STARTUP_JOIN:{e}"))?
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TweakItem {
    id: String,
    ligado: bool,
    precisa_admin: bool,
}

#[derive(Deserialize)]
struct TweakScanScriptResult {
    items: Vec<TweakItem>,
    admin: bool,
    origin: String,
}

#[derive(Serialize)]
pub struct TweakScanResult {
    items: Vec<TweakItem>,
    admin: bool,
}

#[derive(Deserialize, Serialize)]
pub struct TweakToggleResult {
    id: String,
    ligado: bool,
    origin: String,
}

fn tweak_id_allowed(id: &str) -> bool {
    TWEAKS_ALLOWLIST.contains(&id)
}

#[tauri::command]
pub async fn scan_tweaks() -> Result<TweakScanResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &TWEAKS_PS,
            PS_TIMEOUT,
            &[("RESYNC_TWEAKS_ACTION", "scan"), ("RESYNC_TWEAKS_ID", "")],
        )?;
        let parsed: TweakScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed.items.iter().any(|item| !tweak_id_allowed(&item.id))
        {
            return Err("ERR_TWEAKS_ORIGIN".into());
        }
        Ok(TweakScanResult {
            items: parsed.items,
            admin: parsed.admin,
        })
    })
    .await
    .map_err(|e| format!("ERR_TWEAKS_JOIN:{e}"))?
}

#[tauri::command]
pub async fn set_tweak(id: String, ligar: bool) -> Result<TweakToggleResult, String> {
    crate::license::ensure_licensed()?;
    if !tweak_id_allowed(&id) {
        return Err("ERR_TWEAK_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &TWEAKS_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_TWEAKS_ACTION", if ligar { "on" } else { "off" }),
                ("RESYNC_TWEAKS_ID", id.as_str()),
            ],
        )?;
        let parsed: TweakToggleResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_TWEAKS_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_TWEAKS_JOIN:{e}"))?
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FpsBoostItem {
    id: String,
    ligado: bool,
    precisa_admin: bool,
    /// Falso quando o hardware não comporta o ajuste (HDD, sem rota padrão).
    disponivel: bool,
    detalhe: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FpsBoostScanScriptResult {
    items: Vec<FpsBoostItem>,
    admin: bool,
    ram_gb: u32,
    disco_solido: bool,
    origin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FpsBoostScanResult {
    items: Vec<FpsBoostItem>,
    admin: bool,
    ram_gb: u32,
    disco_solido: bool,
}

#[derive(Deserialize, Serialize)]
pub struct FpsBoostToggleResult {
    id: String,
    ligado: bool,
    origin: String,
}

fn fpsboost_id_allowed(id: &str) -> bool {
    FPSBOOST_ALLOWLIST.contains(&id)
}

#[tauri::command]
pub async fn scan_fpsboost() -> Result<FpsBoostScanResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &FPSBOOST_PS,
            PS_TIMEOUT,
            &[("RESYNC_FPSBOOST_ACTION", "scan"), ("RESYNC_FPSBOOST_ID", "")],
        )?;
        let parsed: FpsBoostScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed
                .items
                .iter()
                .any(|item| !fpsboost_id_allowed(&item.id))
        {
            return Err("ERR_FPSBOOST_ORIGIN".into());
        }
        Ok(FpsBoostScanResult {
            items: parsed.items,
            admin: parsed.admin,
            ram_gb: parsed.ram_gb,
            disco_solido: parsed.disco_solido,
        })
    })
    .await
    .map_err(|e| format!("ERR_FPSBOOST_JOIN:{e}"))?
}

#[tauri::command]
pub async fn set_fpsboost(id: String, ligar: bool) -> Result<FpsBoostToggleResult, String> {
    crate::license::ensure_licensed()?;
    if !fpsboost_id_allowed(&id) {
        return Err("ERR_FPSBOOST_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        // A varredura de chaves de driver e de controladoras roda antes de
        // qualquer gravação: 90s não cobre com folga.
        let out = run_powershell_env(
            &FPSBOOST_PS,
            DEBLOAT_TIMEOUT,
            &[
                ("RESYNC_FPSBOOST_ACTION", if ligar { "on" } else { "off" }),
                ("RESYNC_FPSBOOST_ID", id.as_str()),
            ],
        )?;
        let parsed: FpsBoostToggleResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_FPSBOOST_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_FPSBOOST_JOIN:{e}"))?
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeItem {
    id: String,
    instalado: bool,
    versao: String,
    detalhe: String,
    opcional: bool,
    instalavel: bool,
}

#[derive(Deserialize)]
struct RuntimeScanScriptResult {
    items: Vec<RuntimeItem>,
    winget: bool,
    admin: bool,
    origin: String,
}

#[derive(Serialize)]
pub struct RuntimeScanResult {
    items: Vec<RuntimeItem>,
    winget: bool,
    admin: bool,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallResult {
    id: String,
    ok: bool,
    codigo: i64,
    reinicio: bool,
    instalado: bool,
    versao: String,
    detalhe: String,
    origin: String,
}

fn runtime_id_allowed(id: &str) -> bool {
    RUNTIMES_ALLOWLIST.contains(&id)
}

#[tauri::command]
pub async fn scan_runtimes() -> Result<RuntimeScanResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let out = run_powershell_env(
            &RUNTIMES_PS,
            PS_TIMEOUT,
            &[("RESYNC_RUNTIMES_ACTION", "scan"), ("RESYNC_RUNTIMES_ID", "")],
        )?;
        let parsed: RuntimeScanScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured"
            || parsed.items.iter().any(|item| !runtime_id_allowed(&item.id))
        {
            return Err("ERR_RUNTIMES_ORIGIN".into());
        }
        Ok(RuntimeScanResult {
            items: parsed.items,
            winget: parsed.winget,
            admin: parsed.admin,
        })
    })
    .await
    .map_err(|e| format!("ERR_RUNTIMES_JOIN:{e}"))?
}

/// Baixar e instalar leva muito mais que o timeout normal de script.
const RUNTIME_INSTALL_TIMEOUT: Duration = Duration::from_secs(900);

#[tauri::command]
pub async fn install_runtime(id: String) -> Result<RuntimeInstallResult, String> {
    crate::license::ensure_licensed()?;
    if !runtime_id_allowed(&id) {
        return Err("ERR_RUNTIME_NOT_ALLOWED".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &RUNTIMES_PS,
            RUNTIME_INSTALL_TIMEOUT,
            &[
                ("RESYNC_RUNTIMES_ACTION", "install"),
                ("RESYNC_RUNTIMES_ID", id.as_str()),
            ],
        )?;
        let parsed: RuntimeInstallResult = parse_script_json(&out)?;
        if parsed.id != id || parsed.origin != "measured" {
            return Err("ERR_RUNTIMES_RESULT".into());
        }
        Ok(parsed)
    })
    .await
    .map_err(|e| format!("ERR_RUNTIMES_JOIN:{e}"))?
}

/// Grava o log em Downloads e devolve o caminho absoluto: a tela precisa dizer
/// onde o arquivo caiu, e o WebView não expõe isso no download do navegador.
#[tauri::command]
pub async fn export_log_file(nome: String, conteudo: String) -> Result<String, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(move || {
        let seguro = nome
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
            .collect::<String>();
        if seguro.is_empty() || seguro.contains("..") || !seguro.ends_with(".txt") {
            return Err("ERR_LOG_NAME".to_string());
        }
        let perfil = std::env::var("USERPROFILE").map_err(|_| "ERR_LOG_PROFILE".to_string())?;
        let mut destino = std::path::PathBuf::from(&perfil).join("Downloads");
        if !destino.is_dir() {
            destino = std::path::PathBuf::from(&perfil);
        }
        let arquivo = destino.join(&seguro);
        std::fs::write(&arquivo, conteudo.as_bytes()).map_err(|_| "ERR_LOG_WRITE".to_string())?;
        let caminho = arquivo.to_string_lossy().to_string();
        let _ = Command::new("explorer.exe")
            .arg(format!("/select,{caminho}"))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
        Ok(caminho)
    })
    .await
    .map_err(|e| format!("ERR_LOG_JOIN:{e}"))?
}

#[tauri::command]
pub async fn apply_optimization(profile_id: String) -> Result<OptimizationResult, String> {
    crate::license::ensure_licensed()?;
    if !optimization_profile_allowed(&profile_id) {
        return Err("ERR_OPT_PROFILE".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &APPLY_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_OPT_ACTION", "apply"),
                ("RESYNC_OPT_PROFILE", profile_id.as_str()),
            ],
        )?;
        let parsed: ApplyScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured" {
            return Err("ERR_OPT_ORIGIN".into());
        }
        if parsed.aplicados.iter().any(|id| id == "plano-energia-alto")
            && !parsed.performance_verified
        {
            return Err("ERR_POWER_NOT_ACTIVE".into());
        }
        Ok(OptimizationResult {
            profile_id,
            alteracoes_ids: parsed.aplicados,
            power_plan: parsed.power_plan,
            performance_verified: parsed.performance_verified,
            restart_recommended: parsed.restart_recommended,
            origin: parsed.origin,
        })
    })
    .await
    .map_err(|e| format!("ERR_OPT_JOIN:{e}"))?
}

#[tauri::command]
pub async fn revert_optimization() -> Result<OptimizationResult, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = optimization_lock().lock().map_err(|_| "ERR_OPT_LOCK")?;
        let out = run_powershell_env(
            &APPLY_PS,
            PS_TIMEOUT,
            &[
                ("RESYNC_OPT_ACTION", "revert"),
                ("RESYNC_OPT_PROFILE", ""),
            ],
        )?;
        let parsed: RevertScriptResult = parse_script_json(&out)?;
        if parsed.origin != "measured" {
            return Err("ERR_OPT_ORIGIN".into());
        }
        Ok(OptimizationResult {
            profile_id: "restore".into(),
            alteracoes_ids: parsed.revertidos,
            power_plan: None,
            performance_verified: false,
            restart_recommended: false,
            origin: parsed.origin,
        })
    })
    .await
    .map_err(|e| format!("ERR_OPT_JOIN:{e}"))?
}

fn system() -> &'static Mutex<System> {
    static SYS: OnceLock<Mutex<System>> = OnceLock::new();
    SYS.get_or_init(|| Mutex::new(System::new_all()))
}

/// Sensores que não vêm do sysinfo: GPU (nvidia-smi) e temp de CPU (ACPI).
/// Coletados no máximo a cada 1.5s e cacheados — nvidia-smi spawna um processo.
#[derive(Clone, Copy, Default)]
struct Sensores {
    gpu_uso: Option<f32>,
    gpu_temp: Option<f32>,
    gpu_vram_usada_mb: Option<f32>,
    cpu_temp: Option<f32>,
    cpu_temp_origin: Option<&'static str>,
    atualizado_ms: u64,
    cpu_atualizado_ms: u64,
}

fn sensores_cache() -> &'static Mutex<Sensores> {
    static S: OnceLock<Mutex<Sensores>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(Sensores::default()))
}

#[repr(C)]
union PdhFmtValue {
    long_value: i32,
    double_value: f64,
    large_value: i64,
}

#[repr(C)]
struct PdhFmtCounterValue {
    status: u32,
    value: PdhFmtValue,
}

#[link(name = "pdh")]
extern "system" {
    fn PdhOpenQueryW(data_source: *const u16, user_data: usize, query: *mut isize) -> i32;
    fn PdhAddEnglishCounterW(
        query: isize,
        full_counter_path: *const u16,
        user_data: usize,
        counter: *mut isize,
    ) -> i32;
    fn PdhCollectQueryData(query: isize) -> i32;
    fn PdhGetFormattedCounterValue(
        counter: isize,
        format: u32,
        value_type: *mut u32,
        value: *mut PdhFmtCounterValue,
    ) -> i32;
}

#[derive(Default)]
struct CpuPerformanceCounter {
    query: isize,
    counter: isize,
}

#[derive(Default)]
struct CpuUtilityCounter {
    query: isize,
    counter: isize,
}

fn cpu_performance_counter() -> &'static Mutex<CpuPerformanceCounter> {
    static COUNTER: OnceLock<Mutex<CpuPerformanceCounter>> = OnceLock::new();
    COUNTER.get_or_init(|| Mutex::new(CpuPerformanceCounter::default()))
}

fn cpu_utility_counter() -> &'static Mutex<CpuUtilityCounter> {
    static COUNTER: OnceLock<Mutex<CpuUtilityCounter>> = OnceLock::new();
    COUNTER.get_or_init(|| Mutex::new(CpuUtilityCounter::default()))
}

/// Uso total no contador que acompanha o Gerenciador de Tarefas nesta máquina.
/// O sysinfo estava saturando em 100%; `% Processor Time` acompanha a leitura
/// visual do Windows (37% no contador contra 36% no Gerenciador durante o teste).
fn ler_cpu_usage_pct() -> Option<f32> {
    const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
    let mut state = cpu_utility_counter().lock().ok()?;
    if state.query == 0 {
        let mut query = 0isize;
        if unsafe { PdhOpenQueryW(std::ptr::null(), 0, &mut query) } != 0 {
            return None;
        }
        let mut path: Vec<u16> = r"\Processor Information(_Total)\% Processor Time"
            .encode_utf16()
            .collect();
        path.push(0);
        let mut counter = 0isize;
        if unsafe { PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) } != 0 {
            return None;
        }
        state.query = query;
        state.counter = counter;
    }
    if unsafe { PdhCollectQueryData(state.query) } != 0 {
        return None;
    }
    let mut value_type = 0u32;
    let mut value = PdhFmtCounterValue {
        status: 0,
        value: PdhFmtValue { double_value: 0.0 },
    };
    if unsafe {
        PdhGetFormattedCounterValue(state.counter, PDH_FMT_DOUBLE, &mut value_type, &mut value)
    } != 0
        || value.status > 1
    {
        return None;
    }
    let usage = unsafe { value.value.double_value };
    usage.is_finite().then_some(usage.clamp(0.0, 100.0) as f32)
}

/// Clock efetivo no mesmo modelo do Gerenciador de Tarefas:
/// frequência base × `% Processor Performance` do contador PDH do Windows.
fn ler_cpu_clock_ghz(base_ghz: f64) -> Option<f64> {
    const PDH_FMT_DOUBLE: u32 = 0x0000_0200;
    let mut state = cpu_performance_counter().lock().ok()?;
    if state.query == 0 {
        let mut query = 0isize;
        // SAFETY: ponteiros de saída válidos e data_source nulo conforme contrato do PDH.
        if unsafe { PdhOpenQueryW(std::ptr::null(), 0, &mut query) } != 0 {
            return None;
        }
        let mut path: Vec<u16> = r"\Processor Information(_Total)\% Processor Performance"
            .encode_utf16()
            .collect();
        path.push(0);
        let mut counter = 0isize;
        // SAFETY: `path` é UTF-16 NUL-terminated e os handles permanecem válidos no estado estático.
        if unsafe { PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) } != 0 {
            return None;
        }
        state.query = query;
        state.counter = counter;
    }
    // A primeira coleta prepara o contador; chamadas seguintes já devolvem o valor formatado.
    if unsafe { PdhCollectQueryData(state.query) } != 0 {
        return None;
    }
    let mut value_type = 0u32;
    let mut value = PdhFmtCounterValue {
        status: 0,
        value: PdhFmtValue { double_value: 0.0 },
    };
    // SAFETY: contador válido e buffers de saída corretamente alinhados.
    if unsafe {
        PdhGetFormattedCounterValue(state.counter, PDH_FMT_DOUBLE, &mut value_type, &mut value)
    } != 0
        || value.status > 1
    {
        return None;
    }
    // SAFETY: PDH_FMT_DOUBLE seleciona o membro double_value da união.
    let performance_pct = unsafe { value.value.double_value };
    let ghz = base_ghz * performance_pct / 100.0;
    ghz.is_finite()
        .then_some(ghz)
        .filter(|v| (0.1..=10.0).contains(v))
}

fn nvidia_smi_path() -> Option<PathBuf> {
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let candidatos = [
        PathBuf::from(&root).join("System32").join("nvidia-smi.exe"),
        PathBuf::from(std::env::var("ProgramW6432").unwrap_or_else(|_| "C:\\Program Files".into()))
            .join("NVIDIA Corporation")
            .join("NVSMI")
            .join("nvidia-smi.exe"),
    ];
    candidatos.into_iter().find(|p| p.exists())
}

fn run_command_stdout(mut command: Command, timeout: Duration) -> Option<Vec<u8>> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes);
        let _ = tx.send(bytes);
    });
    match rx.recv_timeout(timeout) {
        Ok(bytes) => {
            let status = child.wait().ok()?;
            status.success().then_some(bytes)
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}

/// GPU via nvidia-smi (vem com o driver NVIDIA). Fonte medida real de uso e temperatura.
fn ler_gpu_nvidia() -> (Option<f32>, Option<f32>, Option<f32>) {
    let Some(smi) = nvidia_smi_path() else {
        return (None, None, None);
    };
    let mut command = Command::new(smi);
    command.args([
        "--query-gpu=utilization.gpu,temperature.gpu,memory.used",
        "--format=csv,noheader,nounits",
    ]);
    let Some(stdout) = run_command_stdout(command, Duration::from_secs(5)) else {
        return (None, None, None);
    };
    let texto = String::from_utf8_lossy(&stdout);
    // primeira GPU: "36, 49, 3190"
    let linha = texto.lines().next().unwrap_or("");
    let campos: Vec<f32> = linha
        .split(',')
        .filter_map(|c| c.trim().parse::<f32>().ok())
        .collect();
    (
        campos.first().copied(),
        campos.get(1).copied(),
        campos.get(2).copied(),
    )
}

/// Fallback WDDM, independente de fabricante: funciona com AMD Radeon, Intel
/// Arc/integrada e NVIDIA sem nvidia-smi. Temperatura continua vindo somente de
/// sensor real exposto pelo Libre/OpenHardwareMonitor; ausência permanece null.
fn ler_gpu_windows() -> (Option<f32>, Option<f32>, Option<f32>) {
    let script = r#"
$usage = $null
$temp = $null
$vram = $null
try {
  $perAdapter = @{}
  $engines = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop |
    Where-Object { [string]$_.Name -match '(?i)engtype_(3D|Compute|Graphics)' })
  foreach ($engine in $engines) {
    $name = [string]$engine.Name
    $key = if ($name -match '(?i)(luid_.*?_phys_\d+)') { $matches[1] } else { 'default' }
    if (-not $perAdapter.ContainsKey($key)) { $perAdapter[$key] = 0.0 }
    $perAdapter[$key] += [double]$engine.UtilizationPercentage
  }
  if ($perAdapter.Count -gt 0) {
    $maximum = ($perAdapter.Values | Measure-Object -Maximum).Maximum
    $usage = [math]::Min(100.0, [math]::Max(0.0, [double]$maximum))
  }
} catch {}
try {
  $memory = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory -ErrorAction Stop |
    Measure-Object -Property DedicatedUsage -Maximum)
  if ($memory.Count -gt 0 -and $memory[0].Maximum -ge 0) {
    $vram = [double]$memory[0].Maximum / 1MB
  }
} catch {}
foreach ($namespace in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
  try {
    $sensors = @(Get-CimInstance -Namespace $namespace Sensor -ErrorAction Stop | Where-Object {
      $_.SensorType -eq 'Temperature' -and
      ([string]$_.Identifier -match '(?i)/gpu/' -or [string]$_.Parent -match '(?i)/gpu/')
    })
    $preferred = $sensors | Where-Object { [string]$_.Name -match '(?i)(gpu core|edge|hot spot|junction)' } | Select-Object -First 1
    if ($preferred -and $preferred.Value -gt 0) { $temp = [double]$preferred.Value; break }
    if ($sensors.Count -gt 0) {
      $maximum = $sensors | Measure-Object -Property Value -Maximum
      if ($maximum.Maximum -gt 0) { $temp = [double]$maximum.Maximum; break }
    }
  } catch {}
}
@{ usage = $usage; temp = $temp; vram = $vram } | ConvertTo-Json -Compress
"#;
    let Ok(saida) = run_powershell(script, Duration::from_secs(8)) else {
        return (None, None, None);
    };
    let Ok(parsed) = serde_json::from_str::<Value>(saida.trim()) else {
        return (None, None, None);
    };
    let plausible = |key: &str, min: f32, max: f32| {
        parsed[key]
            .as_f64()
            .map(|v| v as f32)
            .filter(|v| v.is_finite() && (min..=max).contains(v))
    };
    (
        plausible("usage", 0.0, 100.0),
        plausible("temp", 10.0, 125.0),
        plausible("vram", 0.0, 262_144.0),
    )
}

fn ler_gpu() -> (Option<f32>, Option<f32>, Option<f32>) {
    let vendor = ler_gpu_nvidia();
    if vendor.0.is_some() && vendor.1.is_some() && vendor.2.is_some() {
        return vendor;
    }
    let windows = ler_gpu_windows();
    (
        vendor.0.or(windows.0),
        vendor.1.or(windows.1),
        vendor.2.or(windows.2),
    )
}

/// Temp de CPU apenas por sensor que se identifica como CPU no Libre/OpenHardwareMonitor.
/// Zonas ACPI genéricas não são usadas: elas podem medir placa/ambiente e seriam enganosas.
fn ler_cpu_temp() -> (Option<f32>, Option<&'static str>) {
    let script = r#"
$value = $null
$origin = $null
foreach ($namespace in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
  try {
    $cpuSensors = @(Get-CimInstance -Namespace $namespace Sensor -ErrorAction Stop | Where-Object {
      $_.SensorType -eq 'Temperature' -and
      ([string]$_.Identifier -match '(?i)/cpu/' -or [string]$_.Parent -match '(?i)/cpu/')
    })
    $preferred = $cpuSensors | Where-Object { [string]$_.Name -match '(?i)(package|cpu total|tctl|tdie)' } | Select-Object -First 1
    if ($preferred -and $preferred.Value -gt 0) { $value = [double]$preferred.Value; $origin = 'measured'; break }
    if ($cpuSensors.Count -gt 0) {
      $maximum = $cpuSensors | Measure-Object -Property Value -Maximum
      if ($maximum.Maximum -gt 0) { $value = [double]$maximum.Maximum; $origin = 'measured'; break }
    }
  } catch {}
}
if ($null -ne $value) {
  @{ value = [math]::Round($value, 1); origin = $origin } | ConvertTo-Json -Compress
}
"#;
    let Ok(saida) = run_powershell(script, Duration::from_secs(8)) else {
        return (None, None);
    };
    let Ok(parsed) = serde_json::from_str::<Value>(saida.trim()) else {
        return (None, None);
    };
    let Some(v) = parsed["value"].as_f64().map(|v| v as f32) else {
        return (None, None);
    };
    let origin = match parsed["origin"].as_str() {
        Some("measured") => Some("measured"),
        _ => None,
    };
    // filtra leituras absurdas (zona ACPI às vezes reporta 0 ou constantes)
    if (10.0..=120.0).contains(&v) {
        (Some(v), origin)
    } else {
        (None, None)
    }
}

fn agora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sensores_atuais() -> Sensores {
    let mut cache = sensores_cache().lock().unwrap();
    let agora = agora_ms();
    if agora.saturating_sub(cache.atualizado_ms) >= 1500 {
        let (uso, temp, vram) = ler_gpu();
        cache.gpu_uso = uso;
        cache.gpu_temp = temp;
        cache.gpu_vram_usada_mb = vram;
        cache.atualizado_ms = agora;
    }
    // A fonte ACPI é mais cara e usa um relógio independente do cache da GPU.
    if agora.saturating_sub(cache.cpu_atualizado_ms) >= 6000 {
        let (temp, origin) = ler_cpu_temp();
        cache.cpu_temp = temp;
        cache.cpu_temp_origin = origin;
        cache.cpu_atualizado_ms = agora;
    }
    *cache
}

#[derive(Serialize)]
pub struct Metrics {
    #[serde(rename = "cpuUsage")]
    cpu_usage: f32,
    /// GPU sem fonte confiável sem driver vendor — null, nunca inventado.
    #[serde(rename = "gpuUsage")]
    gpu_usage: Option<f32>,
    #[serde(rename = "ramUsedGb")]
    ram_used_gb: f64,
    #[serde(rename = "ramTotalGb")]
    ram_total_gb: f64,
    #[serde(rename = "cpuTempC")]
    cpu_temp_c: Option<f32>,
    #[serde(rename = "cpuTempOrigin")]
    cpu_temp_origin: Option<&'static str>,
    #[serde(rename = "cpuClockGhz")]
    cpu_clock_ghz: Option<f64>,
    #[serde(rename = "gpuTempC")]
    gpu_temp_c: Option<f32>,
    timestamp: u64,
    origin: &'static str,
}

#[tauri::command]
pub fn get_metrics() -> Result<Metrics, String> {
    crate::license::ensure_licensed()?;
    let (cpu_usage, cpu_clock_ghz, ram_used_gb, ram_total_gb) = {
        let mut sys = system().lock().unwrap();
        sys.refresh_cpu_usage();
        sys.refresh_cpu_frequency();
        sys.refresh_memory();
        let frequencies: Vec<u64> = sys
            .cpus()
            .iter()
            .map(|cpu| cpu.frequency())
            .filter(|mhz| *mhz > 0)
            .collect();
        let base_clock = (!frequencies.is_empty())
            .then(|| frequencies.iter().sum::<u64>() as f64 / frequencies.len() as f64 / 1000.0);
        let clock = base_clock.and_then(ler_cpu_clock_ghz).or(base_clock);
        (
            ler_cpu_usage_pct().unwrap_or_else(|| sys.global_cpu_usage()),
            clock,
            sys.used_memory() as f64 / 1_073_741_824.0,
            sys.total_memory() as f64 / 1_073_741_824.0,
        )
    };
    let s = sensores_atuais();
    Ok(Metrics {
        cpu_usage,
        gpu_usage: s.gpu_uso,
        ram_used_gb,
        ram_total_gb,
        cpu_temp_c: s.cpu_temp,
        cpu_temp_origin: s.cpu_temp_origin,
        cpu_clock_ghz,
        gpu_temp_c: s.gpu_temp,
        timestamp: agora_ms(),
        origin: "measured",
    })
}

#[derive(Serialize)]
pub struct Proc {
    pid: u32,
    pids: Vec<u32>,
    instances: u32,
    nome: String,
    #[serde(rename = "ramMb")]
    ram_mb: u64,
    origin: &'static str,
}

#[tauri::command]
pub fn list_processes() -> Result<Vec<Proc>, String> {
    crate::license::ensure_licensed()?;
    let mut sys = system().lock().unwrap();
    atualizar_alvos(&mut sys);
    let dono = dono_da_sessao(&sys);
    let mut agg: HashMap<String, (String, Vec<u32>, u64)> = HashMap::new();
    for (pid, p) in sys.processes() {
        if !alvo_permitido(p, dono.as_ref()) {
            continue;
        }
        let nome = p.name().to_string_lossy().to_string();
        let lower = nome.to_lowercase();
        let e = agg.entry(lower).or_insert_with(|| (nome, Vec::new(), 0));
        e.1.push(pid.as_u32());
        e.2 += p.memory();
    }
    let mut list: Vec<Proc> = agg
        .into_iter()
        .filter(|(_, (_, _, mem))| *mem > 10 * 1024 * 1024)
        .map(|(_, (nome, pids, mem))| Proc {
            pid: pids[0],
            instances: pids.len() as u32,
            pids,
            nome,
            ram_mb: mem / (1024 * 1024),
            origin: "measured",
        })
        .collect();
    list.sort_by_key(|process| std::cmp::Reverse(process.ram_mb));
    list.truncate(60);
    Ok(list)
}

#[tauri::command]
pub fn kill_process(pid: u32) -> Result<Proc, String> {
    crate::license::ensure_licensed()?;
    if pid <= 4 || pid == std::process::id() {
        return Err("ERR_KILL_DENIED".into());
    }
    let mut sys = system().lock().unwrap();
    atualizar_alvos(&mut sys);
    let dono = dono_da_sessao(&sys);
    let p = sys
        .process(Pid::from_u32(pid))
        .ok_or("ERR_KILL_NOT_FOUND")?;
    if !alvo_permitido(p, dono.as_ref()) {
        return Err("ERR_KILL_DENIED".into());
    }
    let nome = p.name().to_string_lossy().to_string();
    let ram_mb = p.memory() / (1024 * 1024);
    if !p.kill() {
        return Err("ERR_KILL_FAILED".into());
    }
    Ok(Proc {
        pid,
        pids: vec![pid],
        instances: 1,
        nome,
        ram_mb,
        origin: "measured",
    })
}

// ---------------------------------------------------------------------------
// Bandeja do sistema
// ---------------------------------------------------------------------------

fn mostrar_janela(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Esconde a janela e garante o ícone na bandeja. Os rótulos chegam traduzidos
/// do front: o menu é nativo e não enxerga o dicionário de i18n.
#[tauri::command]
pub fn hide_to_tray(app: AppHandle, abrir: String, sair: String) -> Result<(), String> {
    if app.tray_by_id("resync").is_none() {
        let item_abrir = MenuItem::with_id(&app, "abrir", &abrir, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        let item_sair =
            MenuItem::with_id(&app, "sair", &sair, true, None::<&str>).map_err(|e| e.to_string())?;
        let menu =
            Menu::with_items(&app, &[&item_abrir, &item_sair]).map_err(|e| e.to_string())?;
        let mut tray = TrayIconBuilder::with_id("resync")
            .tooltip("RESYNC")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, ev| match ev.id.as_ref() {
                "abrir" => mostrar_janela(app),
                "sair" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, ev| {
                if matches!(
                    ev,
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    }
                ) {
                    mostrar_janela(tray.app_handle());
                }
            });
        if let Some(icone) = app.default_window_icon() {
            tray = tray.icon(icone.clone());
        }
        tray.build(&app).map_err(|e| e.to_string())?;
    }
    app.get_webview_window("main")
        .ok_or("ERR_TRAY_NO_WINDOW")?
        .hide()
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Limpeza — SOMENTE diretórios seguros conhecidos. Nunca Downloads/Documentos/etc.
// ---------------------------------------------------------------------------

struct CleanupRoot {
    id: &'static str,
    paths: Vec<PathBuf>,
    /// filtro por prefixo de nome de arquivo (miniaturas)
    prefix: Option<&'static str>,
    default_selected: bool,
    sensitive: bool,
}

#[link(name = "kernel32")]
extern "system" {
    fn GetLogicalDrives() -> u32;
    fn GetDriveTypeW(root_path_name: *const u16) -> u32;
}

/// Raízes locais fixas reconhecidas pelo Windows. Evita incluir unidades de rede
/// ou removíveis na limpeza e permite cobrir C:, D: e demais discos reais.
fn fixed_drive_roots() -> Vec<PathBuf> {
    const DRIVE_FIXED: u32 = 3;
    // SAFETY: APIs sem parâmetros de memória e disponíveis em todas as versões suportadas do Windows.
    let mask = unsafe { GetLogicalDrives() };
    (0..26)
        .filter(|i| mask & (1 << i) != 0)
        .filter_map(|i| {
            let letter = (b'A' + i as u8) as char;
            let root = format!("{letter}:\\");
            let mut wide: Vec<u16> = root.encode_utf16().collect();
            wide.push(0);
            // SAFETY: `wide` é NUL-terminated e permanece viva durante a chamada.
            (unsafe { GetDriveTypeW(wide.as_ptr()) } == DRIVE_FIXED).then(|| PathBuf::from(root))
        })
        .collect()
}

fn cleanup_roots() -> Vec<CleanupRoot> {
    let env = |k: &str| std::env::var(k).ok().map(PathBuf::from);
    let mut roots = Vec::new();
    if let Some(local) = env("LOCALAPPDATA") {
        roots.push(CleanupRoot {
            id: "temp-usuario",
            paths: vec![local.join("Temp")],
            prefix: None,
            default_selected: true,
            sensitive: false,
        });
    }
    if let Some(win) = env("SystemRoot") {
        roots.push(CleanupRoot {
            id: "temp-windows",
            paths: vec![win.join("Temp")],
            prefix: None,
            default_selected: true,
            sensitive: false,
        });
    }
    if let Some(local) = env("LOCALAPPDATA") {
        roots.push(CleanupRoot {
            id: "miniaturas",
            paths: vec![local.join("Microsoft").join("Windows").join("Explorer")],
            prefix: Some("thumbcache"),
            default_selected: false,
            sensitive: false,
        });
        let mut wer = vec![local.join("Microsoft").join("Windows").join("WER")];
        if let Some(pd) = env("ProgramData") {
            wer.push(
                pd.join("Microsoft")
                    .join("Windows")
                    .join("WER")
                    .join("ReportQueue"),
            );
            wer.push(
                pd.join("Microsoft")
                    .join("Windows")
                    .join("WER")
                    .join("ReportArchive"),
            );
        }
        roots.push(CleanupRoot {
            id: "relatorios-erro",
            paths: wer,
            prefix: None,
            default_selected: false,
            sensitive: false,
        });
    }
    if let Some(local) = env("LOCALAPPDATA") {
        let mut shader = vec![
            local.join("D3DSCache"),
            local.join("NVIDIA").join("DXCache"),
            local.join("NVIDIA").join("GLCache"),
            local.join("AMD").join("DxCache"),
            local.join("AMD").join("DxcCache"),
            local.join("AMD").join("GLCache"),
            local.join("Intel").join("ShaderCache"),
        ];
        if let Some(pd) = env("ProgramData") {
            shader.push(pd.join("NVIDIA Corporation").join("NV_Cache"));
        }
        roots.push(CleanupRoot {
            id: "cache-shader",
            paths: shader.into_iter().filter(|p| p.exists()).collect(),
            prefix: None,
            default_selected: false,
            sensitive: false,
        });
    }
    if let Some(win) = env("SystemRoot") {
        roots.push(CleanupRoot {
            id: "cache-update",
            paths: vec![win.join("SoftwareDistribution").join("Download")],
            prefix: None,
            default_selected: false,
            sensitive: false,
        });
        roots.push(CleanupRoot {
            id: "cache-delivery",
            paths: vec![win
                .join("ServiceProfiles")
                .join("NetworkService")
                .join("AppData")
                .join("Local")
                .join("Microsoft")
                .join("Windows")
                .join("DeliveryOptimization")
                .join("Cache")],
            prefix: None,
            default_selected: false,
            sensitive: false,
        });
    }
    let recycle_bins: Vec<PathBuf> = fixed_drive_roots()
        .into_iter()
        .map(|root| root.join("$Recycle.Bin"))
        .filter(|path| path.exists())
        .collect();
    if !recycle_bins.is_empty() {
        roots.push(CleanupRoot {
            id: "lixeira",
            paths: recycle_bins,
            prefix: None,
            default_selected: false,
            sensitive: true,
        });
    }
    roots
}

/// Abrir pedindo DELETE responde exatamente o que o `remove_file` vai encontrar:
/// arquivo que outro processo segura sem compartilhar exclusão não pode ser
/// prometido na varredura — viraria espaço anunciado e não entregue.
fn removivel(path: &Path) -> bool {
    const DELETE: u32 = 0x0001_0000;
    const COMPARTILHA_TUDO: u32 = 0x0000_0007;
    std::fs::OpenOptions::new()
        .access_mode(DELETE)
        .share_mode(COMPARTILHA_TUDO)
        .open(path)
        .is_ok()
}

fn walk(dir: &Path, prefix: Option<&str>, depth: u32, f: &mut impl FnMut(&Path, u64)) {
    if depth > 8 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        let path = entry.path();
        if ft.is_dir() {
            walk(&path, prefix, depth + 1, f);
        } else if ft.is_file() {
            if let Some(pre) = prefix {
                let nome = entry.file_name().to_string_lossy().to_lowercase();
                if !nome.starts_with(pre) {
                    continue;
                }
            }
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            f(&path, size);
        }
    }
}

#[derive(Serialize, Clone)]
pub struct CleanupCat {
    id: String,
    #[serde(rename = "tamanhoBytes")]
    tamanho_bytes: u64,
    arquivos: u64,
    #[serde(rename = "bytesEmUso")]
    bytes_em_uso: u64,
    #[serde(rename = "arquivosEmUso")]
    arquivos_em_uso: u64,
    sensivel: bool,
    #[serde(rename = "selecionadaPorPadrao")]
    selecionada_por_padrao: bool,
}

#[tauri::command]
pub async fn scan_cleanup() -> Result<Vec<CleanupCat>, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(|| {
        cleanup_roots()
            .iter()
            .map(|root| {
                let mut bytes = 0u64;
                let mut count = 0u64;
                let mut bytes_uso = 0u64;
                let mut count_uso = 0u64;
                for p in &root.paths {
                    walk(p, root.prefix, 0, &mut |path, size| {
                        if removivel(path) {
                            bytes += size;
                            count += 1;
                        } else {
                            bytes_uso += size;
                            count_uso += 1;
                        }
                    });
                }
                CleanupCat {
                    id: root.id.into(),
                    tamanho_bytes: bytes,
                    arquivos: count,
                    bytes_em_uso: bytes_uso,
                    arquivos_em_uso: count_uso,
                    sensivel: root.sensitive,
                    selecionada_por_padrao: root.default_selected,
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
pub struct CleanupProgress {
    #[serde(rename = "categoriaId")]
    categoria_id: String,
    #[serde(rename = "bytesLiberados")]
    bytes_liberados: u64,
    #[serde(rename = "arquivosRemovidos")]
    arquivos_removidos: u64,
    concluida: bool,
}

#[tauri::command]
pub async fn execute_cleanup(app: AppHandle, ids: Vec<String>) -> Result<CleanupProgress, String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut total_bytes = 0u64;
        let mut total_files = 0u64;
        for root in cleanup_roots()
            .iter()
            .filter(|r| ids.iter().any(|i| i == r.id))
        {
            let mut cat_bytes = 0u64;
            let mut cat_files = 0u64;
            for p in &root.paths {
                let mut alvos: Vec<(PathBuf, u64)> = Vec::new();
                walk(p, root.prefix, 0, &mut |path, size| {
                    alvos.push((path.to_path_buf(), size))
                });
                for (path, size) in alvos {
                    // arquivo em uso falha silenciosamente — nunca forçar
                    if std::fs::remove_file(&path).is_ok() {
                        cat_bytes += size;
                        cat_files += 1;
                        if cat_files % 100 == 0 {
                            let _ = app.emit(
                                "cleanup-progress",
                                CleanupProgress {
                                    categoria_id: root.id.into(),
                                    bytes_liberados: cat_bytes,
                                    arquivos_removidos: cat_files,
                                    concluida: false,
                                },
                            );
                        }
                    }
                }
            }
            total_bytes += cat_bytes;
            total_files += cat_files;
            let _ = app.emit(
                "cleanup-item",
                CleanupProgress {
                    categoria_id: root.id.into(),
                    bytes_liberados: cat_bytes,
                    arquivos_removidos: cat_files,
                    concluida: true,
                },
            );
        }
        Ok(CleanupProgress {
            categoria_id: "total".into(),
            bytes_liberados: total_bytes,
            arquivos_removidos: total_files,
            concluida: true,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// O inventário roda no PowerShell real desta máquina e precisa devolver o shape
    /// que o front consome. Sem admin, campos SMART podem vir null — nunca ausentes.
    #[test]
    fn inventario_devolve_shape_esperado() {
        let v = collect_inventory().expect("coleta falhou");
        let inv = &v["inventory"];
        let rec = &v["machineRecord"];

        for campo in [
            "cpu",
            "board",
            "memoria",
            "gpu",
            "discos",
            "rede",
            "monitores",
            "audio",
            "energia",
            "perifericos",
            "os",
            "origin",
        ] {
            assert!(!inv[campo].is_null(), "inventory.{campo} ausente");
        }
        assert_eq!(inv["origin"], "measured");
        assert!(
            inv["cpu"]["nome"].as_str().is_some_and(|s| !s.is_empty()),
            "cpu.nome vazio"
        );
        assert!(
            inv["cpu"]["threads"].as_u64().is_some_and(|n| n > 0),
            "cpu.threads invalido"
        );
        assert!(
            inv["memoria"]["totalGb"].as_f64().is_some_and(|n| n > 0.0),
            "memoria.totalGb invalido"
        );
        assert!(
            inv["discos"].as_array().is_some_and(|d| !d.is_empty()),
            "sem discos"
        );
        assert!(
            inv["os"]["build"].as_str().is_some_and(|s| !s.is_empty()),
            "os.build vazio"
        );

        let assinatura = rec["assinatura"].as_str().unwrap_or("");
        assert!(
            assinatura.starts_with("0x") && assinatura.len() == 10,
            "assinatura invalida: {assinatura}"
        );
        assert!(
            rec["hostname"].as_str().is_some_and(|s| !s.is_empty()),
            "hostname vazio"
        );
    }

    #[test]
    fn metricas_sao_plausiveis() {
        let m = get_metrics().expect("gate aberto em debug");
        assert!((0.0..=100.0).contains(&m.cpu_usage), "cpu fora de faixa");
        assert!(
            m.ram_total_gb > 0.0 && m.ram_used_gb <= m.ram_total_gb,
            "ram incoerente"
        );
        assert_eq!(m.origin, "measured");
        // sensores nunca reportam valores absurdos; ausência é null, não lixo
        if let Some(t) = m.gpu_temp_c {
            assert!((0.0..=120.0).contains(&t), "gpu temp absurda: {t}");
        }
        if let Some(u) = m.gpu_usage {
            assert!((0.0..=100.0).contains(&u), "gpu uso fora de faixa: {u}");
        }
        if let Some(t) = m.cpu_temp_c {
            assert!((10.0..=120.0).contains(&t), "cpu temp absurda: {t}");
            assert_eq!(m.cpu_temp_origin, Some("measured"));
        }
        let clock = m.cpu_clock_ghz.expect("clock atual da CPU ausente");
        assert!(
            (0.1..=10.0).contains(&clock),
            "clock atual absurdo: {clock}"
        );
        thread::sleep(Duration::from_millis(1_000));
        let segunda = get_metrics().expect("gate aberto em debug");
        let clock_live = segunda
            .cpu_clock_ghz
            .expect("segunda leitura do clock ausente");
        eprintln!(
            "clock efetivo: {clock_live:.2} GHz | uso CPU PDH: {:.1}%",
            segunda.cpu_usage
        );
        assert!(
            (0.1..=10.0).contains(&clock_live),
            "segundo clock atual absurdo: {clock_live}"
        );
    }

    /// nvidia-smi, quando presente, precisa devolver uso e temperatura plausíveis.
    #[test]
    fn gpu_via_nvidia_smi() {
        if nvidia_smi_path().is_none() {
            eprintln!("nvidia-smi ausente — GPU fica NÃO DISPONÍVEL (ok)");
            return;
        }
        let (uso, temp, vram) = ler_gpu();
        assert!(
            uso.is_some_and(|u| (0.0..=100.0).contains(&u)),
            "uso invalido: {uso:?}"
        );
        assert!(
            temp.is_some_and(|t| (10.0..=120.0).contains(&t)),
            "temp invalida: {temp:?}"
        );
        assert!(vram.is_some_and(|v| v >= 0.0), "vram invalida: {vram:?}");
    }

    #[test]
    fn gpu_via_wddm_independe_de_fabricante() {
        let (uso, temp, vram) = ler_gpu_windows();
        eprintln!("GPU WDDM: uso={uso:?} temp={temp:?} vram_mb={vram:?}");
        if let Some(u) = uso {
            assert!((0.0..=100.0).contains(&u));
        }
        if let Some(t) = temp {
            assert!((10.0..=125.0).contains(&t));
        }
        if let Some(v) = vram {
            assert!((0.0..=262_144.0).contains(&v));
        }
    }

    /// Processos críticos jamais podem ser listados como alvo de encerramento.
    #[test]
    fn lista_de_processos_exclui_criticos() {
        let procs = list_processes().expect("gate aberto em debug");
        for p in &procs {
            assert!(
                !KILL_DENY.contains(&p.nome.to_lowercase().as_str()),
                "processo crítico exposto: {}",
                p.nome
            );
        }
    }

    /// Serviço e driver rodam como SYSTEM: se vazarem pra lista, o usuário
    /// pode desligar a própria máquina achando que está liberando RAM.
    #[test]
    fn lista_de_processos_so_traz_a_sessao_do_usuario() {
        let mut sys = System::new();
        atualizar_alvos(&mut sys);
        let dono = dono_da_sessao(&sys).expect("sem SID do usuário: o filtro ficaria inerte");
        let da_sessao = |nome: &str, meu: bool| {
            sys.processes().values().any(|q| {
                q.name().to_string_lossy().eq_ignore_ascii_case(nome)
                    && (!meu || q.user_id() == Some(&dono))
            })
        };
        let fora: Vec<String> = list_processes()
            .expect("gate aberto em debug")
            .into_iter()
            .filter(|p| da_sessao(&p.nome, false) && !da_sessao(&p.nome, true))
            .map(|p| p.nome)
            .collect();
        assert!(fora.is_empty(), "processos fora da sessão do usuário: {fora:?}");
    }

    /// O número da varredura é uma promessa: só entra o que a limpeza consegue apagar.
    #[test]
    fn varredura_nao_promete_arquivo_em_uso() {
        let dir = std::env::temp_dir().join("resync-teste-limpeza");
        std::fs::create_dir_all(&dir).unwrap();
        let livre = dir.join("livre.bin");
        let preso = dir.join("preso.bin");
        std::fs::write(&livre, b"x").unwrap();
        std::fs::write(&preso, b"x").unwrap();
        let trava = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&preso)
            .unwrap();
        assert!(removivel(&livre), "arquivo livre ficou de fora da varredura");
        assert!(!removivel(&preso), "arquivo em uso entrou na promessa");
        drop(trava);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn perfis_de_otimizacao_usam_whitelist_fechada() {
        for profile in [
            "autonomo",
            "customizado-100",
            "input-reduct-mouse",
            "level-1",
            "level-5",
        ] {
            assert!(
                optimization_profile_allowed(profile),
                "perfil recusado: {profile}"
            );
        }
        for profile in ["restaurar-padrao", "level-0", "autonomo; whoami", ""] {
            assert!(
                !optimization_profile_allowed(profile),
                "perfil perigoso aceito: {profile}"
            );
        }
        for id in GAMES_TUNABLE {
            assert!(
                optimization_profile_allowed(&format!("jogo-{id}")),
                "perfil de jogo recusado: jogo-{id}"
            );
        }
        // cod e roblox têm cache mas NÃO ajuste por exe: o executável real muda
        // a cada versão e o perfil seria mentira.
        for profile in ["jogo-", "jogo-cod", "jogo-roblox", "jogo-cs2; whoami"] {
            assert!(
                !optimization_profile_allowed(profile),
                "perfil de jogo perigoso aceito: {profile}"
            );
        }
    }

    /// Só o código executável. O comentário que explica POR QUE não tocamos numa
    /// área proibida cita o nome dela — sem isso o guarda acusaria a própria doc.
    fn sem_comentarios(fonte: &str) -> String {
        fonte
            .lines()
            .filter(|l| !l.trim_start().starts_with('#'))
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Valida um script no parser do PowerShell 5.1 — é o mesmo runtime que roda
    /// em produção, então erro de sintaxe morre aqui e não na máquina do usuário.
    fn parse_ps51(fonte: &str, rotulo: &str) {
        let parser = r#"
$source = [Console]::In.ReadToEnd()
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
"#;
        let mut child = Command::new(powershell_path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                parser,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("nao iniciou o parser do PowerShell 5.1");
        child
            .stdin
            .take()
            .expect("stdin ausente")
            .write_all(fonte.as_bytes())
            .expect("nao enviou o script ao parser");
        let output = child.wait_with_output().expect("parser nao terminou");
        assert!(
            output.status.success(),
            "{rotulo} invalido no PowerShell 5.1: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn config_de_jogo_tem_allowlist_fechada_e_nao_passa_do_range_da_ui() {
        for id in GAMECONFIG_ALLOWLIST {
            assert!(game_config_allowed(id), "id recusado: {id}");
            assert!(
                GAMECONFIG_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalid in ["valorant", "gta5; whoami", "", "../gta5", "fivem"] {
            assert!(!game_config_allowed(invalid), "id perigoso aceito: {invalid}");
        }
        for preset in GAMECONFIG_PRESETS {
            assert!(game_preset_allowed(preset), "preset recusado: {preset}");
        }
        for invalid in ["ultra", "", "desempenho; rm", "snapshot"] {
            assert!(
                !game_preset_allowed(invalid),
                "preset perigoso aceito: {invalid}"
            );
        }

        // Sem backup gravado não pode existir caminho de escrita.
        assert!(
            GAMECONFIG_PS.contains("ERR_CFG_BACKUP"),
            "o script perdeu a guarda de backup obrigatorio"
        );
        assert!(
            GAMECONFIG_PS.contains("Test-JogoFechado"),
            "o script perdeu a recusa com o jogo aberto"
        );

        // Nada que dê vantagem competitiva ou derrube o anti-cheat.
        let codigo = sem_comentarios(&GAMECONFIG_PS);
        for proibido in [
            "-allow_third_party_software",
            "-untrusted",
            "-nobattleye",
            "cl_interp",
            "sv_cheats",
            "r_drawothermodels",
            "CameraZoom",
        ] {
            assert!(
                !codigo.contains(proibido),
                "config fora do range da UI oficial: {proibido}"
            );
        }
        parse_ps51(&GAMECONFIG_PS, "gameconfig.ps1");
    }

    #[test]
    fn fivem_so_mexe_em_cache_e_nunca_instala_mod() {
        for pasta in FIVEM_FOLDERS {
            assert!(fivem_folder_allowed(pasta), "pasta recusada: {pasta}");
        }
        for invalid in ["citizen", "data", "", "../mods", "mods; whoami"] {
            assert!(
                !fivem_folder_allowed(invalid),
                "pasta perigosa aceita: {invalid}"
            );
        }

        // citizen/ é autoverificado por SHA-256 e game-storage dispara GB de
        // re-download: nenhum dos dois pode aparecer como alvo de escrita.
        let codigo = sem_comentarios(&FIVEM_PS);
        for proibido in [
            "citizen')",
            "game-storage",
            "ros_id.dat",
            "digitalentitlements",
            "IVPath",
            "ReShade5",
        ] {
            assert!(
                !codigo.contains(proibido),
                "FiveM toca area proibida: {proibido}"
            );
        }
        // Mod sai da frente movido, nunca apagado, e o app nunca instala um.
        assert!(
            FIVEM_PS.contains("Move-Item"),
            "o isolamento de mods deixou de mover"
        );
        assert!(
            FIVEM_PS.contains("ERR_GAME_RUNNING"),
            "o script perdeu a recusa com o FiveM aberto"
        );
        parse_ps51(&FIVEM_PS, "fivem.ps1");
    }

    #[test]
    fn jogos_tem_allowlist_fechada_e_script_valido_no_powershell_51() {
        for id in GAMES_ALLOWLIST {
            assert!(game_id_allowed(id), "id recusado: {id}");
            assert!(
                GAMES_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalid in ["minecraft", "cs2; whoami", "", "../cs2"] {
            assert!(!game_id_allowed(invalid), "id perigoso aceito: {invalid}");
        }
        for id in GAMES_TUNABLE {
            assert!(game_id_allowed(id), "id ajustável fora do catálogo: {id}");
        }

        let parser = r#"
$source = [Console]::In.ReadToEnd()
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
"#;
        let mut child = Command::new(powershell_path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                parser,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("nao iniciou o parser do PowerShell 5.1");
        child
            .stdin
            .take()
            .expect("stdin ausente")
            .write_all(GAMES_PS.as_bytes())
            .expect("nao enviou games.ps1 ao parser");
        let output = child.wait_with_output().expect("parser nao terminou");
        assert!(
            output.status.success(),
            "games.ps1 invalido no PowerShell 5.1: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn script_de_otimizacao_e_valido_no_powershell_51() {
        let parser = r#"
$source = [Console]::In.ReadToEnd()
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
"#;
        let mut child = Command::new(powershell_path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                parser,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("nao iniciou o parser do PowerShell 5.1");
        child
            .stdin
            .take()
            .expect("stdin ausente")
            .write_all(APPLY_PS.as_bytes())
            .expect("nao enviou apply.ps1 ao parser");
        let output = child.wait_with_output().expect("parser nao terminou");
        assert!(
            output.status.success(),
            "apply.ps1 invalido no PowerShell 5.1: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn debloat_tem_allowlist_fechada_e_preserva_componentes_essenciais() {
        for id in DEBLOAT_ALLOWLIST {
            assert!(
                DEBLOAT_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalid in [
            "windows-store",
            "desktop-app-installer",
            "edge",
            "webview2",
            "defender",
            "windows-update",
            "feedback-hub; whoami",
            "",
        ] {
            assert!(
                !debloat_id_allowed(invalid),
                "id perigoso aceito: {invalid}"
            );
        }
        for forbidden in [
            "Microsoft.WindowsStore",
            "Microsoft.DesktopAppInstaller",
            "Microsoft.MicrosoftEdge",
            "WebView2",
            "SecHealthUI",
            "DisableAntiSpyware",
            "bcdedit",
        ] {
            assert!(
                !DEBLOAT_PS.contains(forbidden),
                "componente essencial/perigoso encontrado: {forbidden}"
            );
        }
    }

    #[test]
    fn script_de_debloat_e_valido_no_powershell_51() {
        let parser = r#"
$source = [Console]::In.ReadToEnd()
$tokens = $null
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
"#;
        let mut child = Command::new(powershell_path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                parser,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("nao iniciou o parser do PowerShell 5.1");
        child
            .stdin
            .take()
            .expect("stdin ausente")
            .write_all(DEBLOAT_PS.as_bytes())
            .expect("nao enviou debloat.ps1 ao parser");
        let output = child.wait_with_output().expect("parser nao terminou");
        assert!(
            output.status.success(),
            "debloat.ps1 invalido no PowerShell 5.1: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn perfil_full_lite_e_reversivel_e_nao_toca_seguranca() {
        for ajuste in [
            "SystemResponsiveness",
            "DisableUserPresenceQos",
            "AllowGameDVR",
            "PROCTHROTTLEMIN",
            "Disable-LiteTask",
            "Set-LiteService",
            "createdPowerPlan",
            "HwSchMode",
            "NetworkThrottlingIndex",
            "PowerThrottlingOff",
            "CPMINCORES",
            "UserGpuPreferences",
            "DISABLEDXMAXIMIZEDWINDOWEDMODE",
            "CpuPriorityClass",
        ] {
            assert!(APPLY_PS.contains(ajuste), "ajuste ausente: {ajuste}");
        }
        for proibido in [
            "DisableAntiSpyware",
            "DisableRealtimeMonitoring",
            "Windows Defender\\Disable",
            "wuauserv'",
            "MpsSvc'",
            "bcdedit",
        ] {
            assert!(
                !APPLY_PS.contains(proibido),
                "ajuste de seguranca proibido encontrado: {proibido}"
            );
        }
    }

    fn validar_ps51(script: &str, nome: &str) {
        let parser = r#"
$source = [Console]::In.ReadToEnd()
$errors = $null
[void][System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$null, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }
  exit 1
}
"#;
        let mut child = Command::new(powershell_path())
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                parser,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("nao iniciou o parser do PowerShell 5.1");
        child
            .stdin
            .take()
            .expect("stdin ausente")
            .write_all(script.as_bytes())
            .expect("nao enviou o script ao parser");
        let output = child.wait_with_output().expect("parser nao terminou");
        assert!(
            output.status.success(),
            "{nome} invalido no PowerShell 5.1: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn scripts_de_inicializacao_e_ajustes_sao_validos_no_powershell_51() {
        validar_ps51(&STARTUP_PS, "startup.ps1");
        validar_ps51(&TWEAKS_PS, "tweaks.ps1");
        validar_ps51(&RUNTIMES_PS, "runtimes.ps1");
    }

    /// Só instala pacote da lista fixa, e só de fonte oficial: nada de baixar
    /// binário de mirror ou host de terceiro.
    #[test]
    fn runtimes_tem_allowlist_fechada_e_so_usam_winget() {
        for id in RUNTIMES_ALLOWLIST {
            assert!(runtime_id_allowed(id), "id recusado: {id}");
            assert!(
                RUNTIMES_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalido in ["qualquer.exe", "vc2015-x64; whoami", "", "../directx"] {
            assert!(runtime_id_allowed(invalido) == false, "id perigoso aceito: {invalido}");
        }
        for proibido in ["Invoke-WebRequest", "Start-BitsTransfer", "curl ", "http://"] {
            assert!(
                !RUNTIMES_PS.contains(proibido),
                "download fora do winget no script: {proibido}"
            );
        }
        assert!(RUNTIMES_PS.contains("--source', 'winget"), "fonte do winget nao fixada");
    }

    #[test]
    fn ajustes_tem_allowlist_fechada_e_nao_tocam_seguranca() {
        for id in TWEAKS_ALLOWLIST {
            assert!(tweak_id_allowed(id), "id recusado: {id}");
            assert!(
                TWEAKS_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalid in ["defender-off", "vbs-off; whoami", "", "../vbs-off"] {
            assert!(!tweak_id_allowed(invalid), "id perigoso aceito: {invalid}");
        }
        for proibido in [
            "DisableAntiSpyware",
            "DisableRealtimeMonitoring",
            "wuauserv",
            "MpsSvc",
            "EnableLUA",
        ] {
            assert!(
                !TWEAKS_PS.contains(proibido),
                "ajuste de seguranca proibido encontrado: {proibido}"
            );
        }
        // bcdedit é liberado só pra apagar os limites que o MSCONFIG grava. Qualquer
        // elemento que decide COMO a máquina dá boot fica fora: errar ali não boota.
        assert!(
            TWEAKS_PS.contains("$BcdLimites = @('numproc', 'truncatememory')"),
            "a lista fechada de elementos do BCD sumiu do script"
        );
        for boot_critico in [
            "safeboot",
            "testsigning",
            "nointegritychecks",
            "osdevice",
            "systemroot",
            "bootstatuspolicy",
            "disabledynamictick",
            "useplatformtick",
            "/deletevalue '{default}'",
            "/import",
            "/delete ",
        ] {
            assert!(
                !TWEAKS_PS.contains(boot_critico),
                "ajuste toca elemento de boot proibido: {boot_critico}"
            );
        }
    }

    #[test]
    fn fpsboost_tem_allowlist_fechada_e_nao_toca_seguranca() {
        for id in FPSBOOST_ALLOWLIST {
            assert!(fpsboost_id_allowed(id), "id recusado: {id}");
            assert!(
                FPSBOOST_PS.contains(&format!("'{id}'")),
                "id ausente no script fixo: {id}"
            );
        }
        for invalido in [
            "defender-off",
            "cpu-idle-off; whoami",
            "",
            "../mitigacoes-cpu-off",
            "uac-off",
        ] {
            assert!(
                !fpsboost_id_allowed(invalido),
                "id perigoso aceito: {invalido}"
            );
        }
        // O módulo mexe em desempenho, nunca na superfície de segurança nem no boot:
        // errar em qualquer um destes deixa a máquina exposta ou sem subir.
        for proibido in [
            "DisableAntiSpyware",
            "DisableRealtimeMonitoring",
            "Windows Defender",
            "wuauserv",
            "MpsSvc",
            "EnableLUA",
            "ConsentPromptBehaviorAdmin",
            "bcdedit",
            "Image File Execution Options",
            "PerfOptions",
            "Set-ProcessMitigation",
            "takeown",
            "icacls",
            "SetACL",
            "DisabledComponents",
            "HKEY_USERS",
            "EventLog",
        ] {
            assert!(
                !FPSBOOST_PS.contains(proibido),
                "termo proibido encontrado no fpsboost.ps1: {proibido}"
            );
        }
    }

    #[test]
    fn fpsboost_e_valido_no_powershell_51() {
        validar_ps51(&FPSBOOST_PS, "fpsboost.ps1");
    }

    #[test]
    fn inicializacao_valida_ids_e_protege_seguranca() {
        for valido in [
            "hkcu-run|Steam",
            "hklm-run|Riot Vanguard",
            "hklm-run32|Lightshot",
            "pasta-usuario|atalho.lnk",
            "pasta-comum|app.lnk",
        ] {
            assert!(startup_id_valid(valido), "id valido recusado: {valido}");
        }
        for invalido in ["", "Steam", "outro|Steam", "hkcu-run|", "hkcu-run|a\nb"] {
            assert!(!startup_id_valid(invalido), "id invalido aceito: {invalido}");
        }
        assert!(
            STARTUP_PS.contains("SecurityHealth"),
            "protecao de SecurityHealth ausente"
        );
    }

    #[test]
    fn entrada_devolve_estado_medido_do_registro() {
        let out =
            run_powershell(&INPUT_PS, Duration::from_secs(20)).expect("leitura de entrada falhou");
        let start = out
            .find('[')
            .or_else(|| out.find('{'))
            .expect("json ausente");
        let value: Value =
            serde_json::from_str(out[start..].trim()).expect("json de entrada invalido");
        let devices = value.as_array().cloned().unwrap_or_else(|| vec![value]);
        for device in devices {
            assert!(device["tipo"] == "mouse" || device["tipo"] == "teclado");
            for field in [
                "mouseAcceleration",
                "keyboardRepeatRate",
                "keyboardRepeatDelay",
            ] {
                if !device[field].is_null() {
                    assert_eq!(device[field]["origin"], "measured");
                    assert!(!device[field]["value"].is_null());
                }
            }
            if !device["taxaHz"].is_null() {
                assert!(device["taxaHz"].as_f64().is_some_and(|v| v > 0.0));
                assert!(matches!(
                    device["taxaHzOrigin"].as_str(),
                    Some("measured" | "estimated")
                ));
            }
        }
    }

    #[test]
    fn limpeza_cobre_lixeiras_das_unidades_fixas() {
        let expected: Vec<PathBuf> = fixed_drive_roots()
            .into_iter()
            .map(|root| root.join("$Recycle.Bin"))
            .filter(|path| path.exists())
            .collect();
        let roots = cleanup_roots();
        let recycle = roots.iter().find(|root| root.id == "lixeira");
        if expected.is_empty() {
            assert!(recycle.is_none());
        } else {
            let recycle = recycle.expect("categoria lixeira ausente");
            assert!(recycle.sensitive, "lixeira precisa ser sensivel");
            assert_eq!(recycle.paths, expected);
        }
    }
}
