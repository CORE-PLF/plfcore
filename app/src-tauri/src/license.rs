use keyring::{Entry, Error as KeyringError};
use reqwest::blocking::Client;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const CREDENTIAL_SERVICE: &str = "com.plfcore.app";
const CREDENTIAL_USER: &str = "device-license";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const OFFLINE_GRACE_SECS: u64 = 72 * 60 * 60;
/// Janela em que o gate confia na última validação real. O heartbeat do front
/// roda a cada 15 min; 20 min dá margem sem deixar o gate aberto indefinidamente.
const GATE_TTL_SECS: u64 = 20 * 60;

/// Unix ts até quando os comandos nativos ficam liberados. Só as validações
/// reais deste módulo (servidor ou grace offline) escrevem aqui — patch no
/// bundle JS não abre o gate, porque o Rust nunca viu licença válida.
static GATE_OK_UNTIL: AtomicU64 = AtomicU64::new(0);

fn gate_update(state: &LicenseState) {
    if state.allowed {
        GATE_OK_UNTIL.store(now_unix() + GATE_TTL_SECS, Ordering::Release);
    } else {
        GATE_OK_UNTIL.store(0, Ordering::Release);
    }
}

fn gate_open() -> bool {
    now_unix() < GATE_OK_UNTIL.load(Ordering::Acquire)
}

/// Todo comando de valor chama isto na entrada. Em debug o gate fica aberto
/// (dev sem servidor de licença); o branch nem existe no binário release.
pub fn ensure_licensed() -> Result<(), String> {
    if cfg!(debug_assertions) || gate_open() {
        Ok(())
    } else {
        Err("ERR_LICENSE_REQUIRED".into())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredLicense {
    token: String,
    hwid: String,
    plan_name: String,
    expires_at: Option<String>,
    last_validated_unix: u64,
    last_observed_unix: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanResponse {
    name: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateResponse {
    device_token: String,
    status: String,
    plan: PlanResponse,
    expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValidateResponse {
    status: String,
    plan: PlanResponse,
    expires_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct VersionResponse {
    version: String,
    #[serde(default)]
    notes: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    atual: String,
    disponivel: String,
    tem_nova: bool,
    notas: String,
}

#[derive(Clone, Debug, Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Clone, Debug, Deserialize)]
struct ApiErrorBody {
    code: String,
}

#[derive(Clone, Debug)]
enum ApiFailure {
    Server(String),
    Network,
    InvalidResponse,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    allowed: bool,
    status: String,
    plan_name: Option<String>,
    expires_at: Option<String>,
    offline: bool,
    error_code: Option<String>,
}

impl LicenseState {
    fn unlicensed(error_code: Option<String>) -> Self {
        Self {
            allowed: false,
            status: "UNLICENSED".into(),
            plan_name: None,
            expires_at: None,
            offline: false,
            error_code,
        }
    }

    fn blocked(status: String, stored: &StoredLicense) -> Self {
        Self {
            allowed: false,
            status: status.clone(),
            plan_name: Some(stored.plan_name.clone()),
            expires_at: stored.expires_at.clone(),
            offline: false,
            error_code: Some(status),
        }
    }

    fn allowed(status: &str, plan_name: String, expires_at: Option<String>, offline: bool) -> Self {
        Self {
            allowed: true,
            status: status.into(),
            plan_name: Some(plan_name),
            expires_at,
            offline,
            error_code: None,
        }
    }
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Base do site para links de venda. Mesma origem da API — em release vem do
/// build (PLFCORE_API_BASE_URL); sem ela, o domínio de produção.
pub fn site_base() -> &'static str {
    match option_env!("PLFCORE_API_BASE_URL") {
        Some(value) if value.starts_with("https://") => value.trim_end_matches('/'),
        _ => "https://plfcore.com.br",
    }
}

fn api_base() -> Result<&'static str, ApiFailure> {
    if let Some(value) = option_env!("PLFCORE_API_BASE_URL") {
        let trimmed = value.trim_end_matches('/');
        if trimmed.starts_with("https://")
            || (cfg!(debug_assertions) && trimmed.starts_with("http://"))
        {
            return Ok(trimmed);
        }
        return Err(ApiFailure::Server("ERR_API_URL_INVALID".into()));
    }
    if cfg!(debug_assertions) {
        Ok("http://localhost:3000")
    } else {
        Err(ApiFailure::Server("ERR_API_NOT_CONFIGURED".into()))
    }
}

fn credential() -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_USER).map_err(|_| "ERR_CREDENTIAL_STORE".to_string())
}

fn load_stored() -> Result<Option<StoredLicense>, String> {
    match credential()?.get_password() {
        Ok(raw) => serde_json::from_str(&raw)
            .map(Some)
            .map_err(|_| "ERR_CREDENTIAL_CORRUPT".into()),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("ERR_CREDENTIAL_READ".into()),
    }
}

fn save_stored(value: &StoredLicense) -> Result<(), String> {
    let raw = serde_json::to_string(value).map_err(|_| "ERR_CREDENTIAL_SERIALIZE".to_string())?;
    credential()?
        .set_password(&raw)
        .map_err(|_| "ERR_CREDENTIAL_WRITE".to_string())
}

fn delete_stored() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("ERR_CREDENTIAL_DELETE".into()),
    }
}

fn machine_guid() -> Result<String, String> {
    let output = Command::new("reg.exe")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|_| "ERR_HWID_SOURCE".to_string())?;
    if !output.status.success() {
        return Err("ERR_HWID_SOURCE".into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find_map(|line| {
            let mut parts = line.split_whitespace();
            let name = parts.next()?;
            let kind = parts.next()?;
            let value = parts.next()?;
            (name.eq_ignore_ascii_case("MachineGuid") && kind.eq_ignore_ascii_case("REG_SZ"))
                .then(|| value.to_ascii_lowercase())
        })
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "ERR_HWID_SOURCE".into())
}

fn hwid() -> Result<String, String> {
    let source = format!("plfcore:v1|{}", machine_guid()?);
    Ok(format!("{:x}", Sha256::digest(source.as_bytes())))
}

fn client() -> Result<Client, ApiFailure> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .user_agent(format!("PLFCore/{APP_VERSION}"))
        .build()
        .map_err(|_| ApiFailure::Network)
}

fn post<T: DeserializeOwned, B: Serialize>(path: &str, body: &B) -> Result<T, ApiFailure> {
    let url = format!("{}{}", api_base()?, path);
    let response = client()?
        .post(url)
        .json(body)
        .send()
        .map_err(|_| ApiFailure::Network)?;
    if !response.status().is_success() {
        return match response.json::<ApiErrorEnvelope>() {
            Ok(value) => Err(ApiFailure::Server(value.error.code)),
            Err(_) => Err(ApiFailure::InvalidResponse),
        };
    }
    response
        .json::<T>()
        .map_err(|_| ApiFailure::InvalidResponse)
}

fn get<T: DeserializeOwned>(path: &str) -> Result<T, ApiFailure> {
    let url = format!("{}{}", api_base()?, path);
    let response = client()?.get(url).send().map_err(|_| ApiFailure::Network)?;
    if !response.status().is_success() {
        return match response.json::<ApiErrorEnvelope>() {
            Ok(value) => Err(ApiFailure::Server(value.error.code)),
            Err(_) => Err(ApiFailure::InvalidResponse),
        };
    }
    response
        .json::<T>()
        .map_err(|_| ApiFailure::InvalidResponse)
}

fn validate_online(
    stored: &mut StoredLicense,
    current_hwid: &str,
) -> Result<LicenseState, ApiFailure> {
    let response: ValidateResponse = post(
        "/api/v1/licenses/validate",
        &serde_json::json!({ "token": stored.token, "hwid": current_hwid }),
    )?;
    let now = now_unix();
    stored.plan_name = response.plan.name;
    stored.expires_at = response.expires_at;
    stored.last_validated_unix = now;
    stored.last_observed_unix = now;
    save_stored(stored).map_err(ApiFailure::Server)?;
    Ok(LicenseState::allowed(
        &response.status,
        stored.plan_name.clone(),
        stored.expires_at.clone(),
        false,
    ))
}

fn offline_state(stored: &mut StoredLicense) -> Option<LicenseState> {
    let now = now_unix();
    let clock_rolled_back = now.saturating_add(300) < stored.last_observed_unix;
    let within_grace = now.saturating_sub(stored.last_validated_unix) <= OFFLINE_GRACE_SECS;
    if clock_rolled_back || !within_grace {
        return None;
    }
    stored.last_observed_unix = stored.last_observed_unix.max(now);
    let _ = save_stored(stored);
    Some(LicenseState::allowed(
        "OFFLINE_GRACE",
        stored.plan_name.clone(),
        stored.expires_at.clone(),
        true,
    ))
}

fn check_impl() -> Result<LicenseState, String> {
    let current_hwid = hwid()?;
    let Some(mut stored) = load_stored()? else {
        return Ok(LicenseState::unlicensed(None));
    };
    if stored.hwid != current_hwid {
        delete_stored()?;
        return Ok(LicenseState::unlicensed(Some(
            "ERR_DEVICE_NOT_BOUND".into(),
        )));
    }
    match validate_online(&mut stored, &current_hwid) {
        Ok(state) => Ok(state),
        Err(ApiFailure::Network) => Ok(offline_state(&mut stored)
            .unwrap_or_else(|| LicenseState::blocked("ERR_OFFLINE_GRACE_EXPIRED".into(), &stored))),
        Err(ApiFailure::Server(code)) if code == "ERR_DEVICE_NOT_BOUND" => {
            delete_stored()?;
            Ok(LicenseState::unlicensed(Some(code)))
        }
        Err(ApiFailure::Server(code)) => Ok(LicenseState::blocked(code, &stored)),
        Err(ApiFailure::InvalidResponse) => Ok(offline_state(&mut stored)
            .unwrap_or_else(|| LicenseState::blocked("ERR_API_INVALID_RESPONSE".into(), &stored))),
    }
}

#[tauri::command]
pub async fn license_check() -> Result<LicenseState, String> {
    let result = tauri::async_runtime::spawn_blocking(check_impl)
        .await
        .map_err(|_| "ERR_LICENSE_TASK".to_string())?;
    if let Ok(state) = &result {
        gate_update(state);
    }
    result
}

#[tauri::command]
pub async fn license_activate(key: String) -> Result<LicenseState, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let clean_key = key.trim().to_ascii_uppercase();
        if clean_key.is_empty() || clean_key.len() > 64 {
            return Ok(LicenseState::unlicensed(Some("ERR_INVALID_KEY".into())));
        }
        let current_hwid = hwid()?;
        let device_name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "WINDOWS-PC".into());
        let response: ActivateResponse = match post(
            "/api/v1/licenses/activate",
            &serde_json::json!({
                "key": clean_key,
                "hwid": current_hwid,
                "deviceName": device_name,
                "appVersion": APP_VERSION,
            }),
        ) {
            Ok(value) => value,
            Err(ApiFailure::Server(code)) => return Ok(LicenseState::unlicensed(Some(code))),
            Err(ApiFailure::Network) => {
                return Ok(LicenseState::unlicensed(Some("ERR_API_UNAVAILABLE".into())))
            }
            Err(ApiFailure::InvalidResponse) => {
                return Ok(LicenseState::unlicensed(Some(
                    "ERR_API_INVALID_RESPONSE".into(),
                )))
            }
        };
        let now = now_unix();
        let stored = StoredLicense {
            token: response.device_token,
            hwid: current_hwid,
            plan_name: response.plan.name,
            expires_at: response.expires_at,
            last_validated_unix: now,
            last_observed_unix: now,
        };
        save_stored(&stored)?;
        Ok(LicenseState::allowed(
            &response.status,
            stored.plan_name,
            stored.expires_at,
            false,
        ))
    })
    .await
    .map_err(|_| "ERR_LICENSE_TASK".to_string())?;
    if let Ok(state) = &result {
        gate_update(state);
    }
    result
}

#[tauri::command]
pub async fn license_heartbeat() -> Result<LicenseState, String> {
    let result = tauri::async_runtime::spawn_blocking(|| {
        let current_hwid = hwid()?;
        let Some(mut stored) = load_stored()? else {
            return Ok(LicenseState::unlicensed(None));
        };
        if stored.hwid != current_hwid {
            delete_stored()?;
            return Ok(LicenseState::unlicensed(Some(
                "ERR_DEVICE_NOT_BOUND".into(),
            )));
        }
        let response: Result<ValidateResponse, ApiFailure> = post(
            "/api/v1/licenses/heartbeat",
            &serde_json::json!({
                "token": stored.token,
                "hwid": current_hwid,
                "appVersion": APP_VERSION,
            }),
        );
        match response {
            Ok(value) => {
                let now = now_unix();
                stored.plan_name = value.plan.name;
                stored.expires_at = value.expires_at;
                stored.last_validated_unix = now;
                stored.last_observed_unix = now;
                save_stored(&stored)?;
                Ok(LicenseState::allowed(
                    &value.status,
                    stored.plan_name,
                    stored.expires_at,
                    false,
                ))
            }
            Err(ApiFailure::Network) => Ok(offline_state(&mut stored).unwrap_or_else(|| {
                LicenseState::blocked("ERR_OFFLINE_GRACE_EXPIRED".into(), &stored)
            })),
            Err(ApiFailure::Server(code)) => Ok(LicenseState::blocked(code, &stored)),
            Err(ApiFailure::InvalidResponse) => Ok(LicenseState::blocked(
                "ERR_API_INVALID_RESPONSE".into(),
                &stored,
            )),
        }
    })
    .await
    .map_err(|_| "ERR_LICENSE_TASK".to_string())?;
    if let Ok(state) = &result {
        gate_update(state);
    }
    result
}

/// Versão comparada por partes numéricas: em texto puro "1.9.0" venceria
/// "1.10.0" e ninguém receberia a atualização.
fn version_parts(value: &str) -> Vec<u32> {
    value
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.trim_matches(|c: char| !c.is_ascii_digit())
                .parse()
                .unwrap_or(0)
        })
        .collect()
}

fn is_newer(remote: &str, local: &str) -> bool {
    let (remote, local) = (version_parts(remote), version_parts(local));
    for i in 0..remote.len().max(local.len()) {
        let (a, b) = (
            remote.get(i).copied().unwrap_or(0),
            local.get(i).copied().unwrap_or(0),
        );
        if a != b {
            return a > b;
        }
    }
    false
}

#[tauri::command]
pub async fn check_app_update() -> Result<UpdateState, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let atual = APP_VERSION.to_string();
        // Sem rede ou sem versão publicada não é problema do usuário: responde
        // "não tem nova" e a UI não mostra nada.
        let Ok(response) = get::<VersionResponse>("/api/v1/app/version") else {
            return UpdateState {
                disponivel: atual.clone(),
                tem_nova: false,
                notas: String::new(),
                atual,
            };
        };
        UpdateState {
            tem_nova: is_newer(&response.version, &atual),
            disponivel: response.version,
            notas: response.notes,
            atual,
        }
    })
    .await
    .map_err(|_| "ERR_UPDATE_TASK".to_string())
}

#[tauri::command]
pub async fn license_forget() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(delete_stored)
        .await
        .map_err(|_| "ERR_LICENSE_TASK".to_string())?
}

#[tauri::command]
pub fn close_license_window(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hwid_is_sha256_hex() {
        let value = hwid().expect("MachineGuid deve existir no Windows");
        assert_eq!(value.len(), 64);
        assert!(value.bytes().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn release_endpoint_never_accepts_plain_http() {
        if !cfg!(debug_assertions) {
            assert!(!api_base().unwrap_or("").starts_with("http://"));
        }
    }

    #[test]
    fn gate_only_opens_after_real_validation() {
        GATE_OK_UNTIL.store(0, Ordering::Release);
        assert!(!gate_open(), "gate nunca nasce aberto");
        gate_update(&LicenseState::unlicensed(None));
        assert!(!gate_open(), "estado não-licenciado não abre o gate");
        gate_update(&LicenseState::allowed("ACTIVE", "PRO".into(), None, false));
        assert!(gate_open(), "validação real abre o gate");
        gate_update(&LicenseState::unlicensed(Some("ERR_LICENSE_EXPIRED".into())));
        assert!(!gate_open(), "bloqueio derruba o gate na hora");
    }

    #[test]
    fn version_compare_is_numeric() {
        assert!(is_newer("1.10.0", "1.9.0"));
        assert!(!is_newer("1.9.0", "1.10.0"));
        assert!(!is_newer("1.2.3", "1.2.3"));
        assert!(is_newer("1.2.3", "1.2"));
        assert!(!is_newer("v1.2.0", "1.2.0"));
        assert!(!is_newer("lixo", "1.0.0"));
    }

    /// O aviso de atualização compara a versão publicada contra CARGO_PKG_VERSION.
    /// Se o Cargo.toml ficar para trás do número que o instalador carrega, a
    /// pessoa nunca é avisada — ou é avisada para sempre.
    #[test]
    fn versao_do_cargo_bate_com_a_do_instalador() {
        let conf = include_str!("../tauri.conf.json");
        let conf: serde_json::Value = serde_json::from_str(conf).expect("tauri.conf.json inválido");
        assert_eq!(
            conf["version"].as_str(),
            Some(APP_VERSION),
            "tauri.conf.json e Cargo.toml com versões diferentes"
        );
    }

    #[test]
    fn offline_grace_rejects_clock_rollback() {
        let now = now_unix();
        let mut stored = StoredLicense {
            token: "x".repeat(40),
            hwid: "0".repeat(64),
            plan_name: "TESTE".into(),
            expires_at: None,
            last_validated_unix: now,
            last_observed_unix: now + 600,
        };
        assert!(offline_state(&mut stored).is_none());
    }
}
