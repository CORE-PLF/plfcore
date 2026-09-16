// Biblioteca de packs de som: busca o catálogo remoto e baixa os .rpf direto
// para %LOCALAPPDATA%\PLFCore\packs\<slug>, o layout que o sounds.ps1 já lê.
// Aqui NÃO se instala nada — quem escreve no GTA é o sounds.ps1.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

/// Mesma lista fechada do $SndPermitidos do sounds.ps1. O nome do arquivo vem
/// do manifest, que é remoto: fora desta lista nada é gravado.
const ARQUIVOS: [&str; 2] = ["RESIDENT.rpf", "WEAPONS_PLAYER.rpf"];

#[derive(Deserialize, Clone)]
pub struct ArquivoRemoto {
    pub nome: String,
    pub url: String,
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progresso {
    slug: String,
    arquivo: String,
    fase: &'static str,
    pct: u8,
    recebido_bytes: u64,
    total_bytes: u64,
}

/// O que o sounds.ps1 lê antes de instalar: nome de exibição e o sha256 de
/// cada .rpf.
#[derive(Serialize)]
struct PackMeta {
    nome: String,
    sha256: BTreeMap<String, String>,
}

fn biblioteca() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".into());
    PathBuf::from(local).join("PLFCore").join("packs")
}

/// O slug vira nome de pasta dentro da biblioteca: uma barra ou ".." deixaria
/// o download escrever fora dela.
fn slug_ok(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 64
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn arquivo_ok(nome: &str) -> bool {
    ARQUIVOS.contains(&nome)
}

/// Separada do cfg! para o teste conseguir checar os dois lados — em release o
/// pack viaja por https ou não viaja.
fn url_ok_com(url: &str, permite_http: bool) -> bool {
    url.starts_with("https://") || (permite_http && url.starts_with("http://"))
}

fn url_ok(url: &str) -> bool {
    url_ok_com(url, cfg!(debug_assertions))
}

/// Option para o download rodar em teste, sem janela.
fn emitir(
    app: Option<&AppHandle>,
    slug: &str,
    arquivo: &str,
    fase: &'static str,
    pct: u8,
    recebido: u64,
    total: u64,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "pack-progress",
            Progresso {
                slug: slug.to_string(),
                arquivo: arquivo.to_string(),
                fase,
                pct,
                recebido_bytes: recebido,
                total_bytes: total,
            },
        );
    }
}

fn pct(feito: u64, total: u64) -> u8 {
    (feito * 100).checked_div(total).unwrap_or(0).min(100) as u8
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Confere um arquivo já baixado avisando a tela a cada 1%: 112 MB levam
/// segundos e sem sinal de vida a barra parece travada.
fn hash_arquivo_com_progresso(
    p: &Path,
    app: Option<&AppHandle>,
    slug: &str,
    arquivo: &str,
) -> Result<String, String> {
    let total = fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let mut f = fs::File::open(p).map_err(|e| format!("ERR_PACK_HASH_ABRE:{e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 256];
    let mut lidos: u64 = 0;
    let mut ultimo = 255u8;
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| format!("ERR_PACK_HASH_LER:{e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        lidos += n as u64;
        let pct = pct(lidos, total);
        if pct != ultimo {
            ultimo = pct;
            emitir(app, slug, arquivo, "conferindo", pct, lidos, total);
        }
    }
    Ok(hex(&hasher.finalize()))
}

/// Baixa conferindo o sha256 no mesmo passe — ler 112 MB duas vezes só para
/// verificar seria desperdício. `sha` é None na prévia, que não tem hash.
fn baixar(
    app: Option<&AppHandle>,
    slug: &str,
    alvo: &Path,
    url: &str,
    bytes: u64,
    sha: Option<&str>,
) -> Result<(), String> {
    let nome = alvo
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    // Já está na biblioteca: confere antes de reusar; corrompido baixa de novo
    // em vez de travar a instalação.
    if let Ok(meta) = fs::metadata(alvo) {
        match sha {
            Some(sha) => {
                if meta.len() == bytes {
                    if hash_arquivo_com_progresso(alvo, app, slug, &nome)?
                        .eq_ignore_ascii_case(sha)
                    {
                        return Ok(());
                    }
                    let _ = fs::remove_file(alvo);
                }
            }
            None => {
                if meta.len() > 0 {
                    return Ok(());
                }
            }
        }
    }

    // timeout None: 112 MB em conexão ruim não cabe em limite de relógio.
    let cliente = reqwest::blocking::Client::builder()
        .timeout(None)
        .build()
        .map_err(|e| format!("ERR_PACK_HTTP_CLIENTE:{e}"))?;
    let mut resp = cliente
        .get(url)
        .send()
        .map_err(|e| format!("ERR_PACK_DOWNLOAD:{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ERR_PACK_DOWNLOAD_HTTP:{}", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(bytes);

    let parcial = alvo.with_extension("parcial");
    let mut arq = fs::File::create(&parcial).map_err(|e| format!("ERR_PACK_CRIA:{e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1024 * 256];
    let mut recebido: u64 = 0;
    let mut ultimo_pct = 255u8;
    loop {
        let n = resp
            .read(&mut buf)
            .map_err(|e| format!("ERR_PACK_DOWNLOAD_LER:{e}"))?;
        if n == 0 {
            break;
        }
        arq.write_all(&buf[..n])
            .map_err(|e| format!("ERR_PACK_ESCREVE:{e}"))?;
        hasher.update(&buf[..n]);
        recebido += n as u64;
        let pct = pct(recebido, total);
        if pct != ultimo_pct {
            ultimo_pct = pct;
            emitir(app, slug, &nome, "baixando", pct, recebido, total);
        }
    }
    drop(arq);

    if let Some(sha) = sha {
        if !hex(&hasher.finalize()).eq_ignore_ascii_case(sha) {
            let _ = fs::remove_file(&parcial);
            return Err("ERR_SHA".into());
        }
    }
    let _ = fs::remove_file(alvo);
    fs::rename(&parcial, alvo).map_err(|e| format!("ERR_PACK_RENOMEIA:{e}"))
}

/// O catálogo é buscado aqui e não no fetch da webview: o Garage não manda
/// cabeçalho de CORS, então a página seria bloqueada pelo navegador.
/// async + spawn_blocking: comando síncrono roda na thread da interface e
/// congelaria a janela enquanto a rede responde.
#[tauri::command]
pub async fn manifest_baixar(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || manifest_baixar_sync(&url))
        .await
        .map_err(|e| format!("ERR_PACK_JOIN:{e}"))?
}

fn manifest_baixar_sync(url: &str) -> Result<String, String> {
    if !url_ok(url) {
        return Err("ERR_PACK_URL".into());
    }
    let cliente = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("ERR_PACK_HTTP_CLIENTE:{e}"))?;
    let resp = cliente
        .get(url)
        .send()
        .map_err(|e| format!("ERR_MANIFEST:{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ERR_MANIFEST_HTTP:{}", resp.status().as_u16()));
    }
    resp.text().map_err(|e| format!("ERR_MANIFEST_LER:{e}"))
}

#[tauri::command]
pub async fn baixar_pack(
    app: AppHandle,
    slug: String,
    arquivos: Vec<ArquivoRemoto>,
    preview_url: Option<String>,
    nome: String,
) -> Result<(), String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(move || {
        baixar_pack_sync(Some(&app), &slug, &arquivos, preview_url.as_deref(), &nome)
    })
    .await
    .map_err(|e| format!("ERR_PACK_JOIN:{e}"))?
}

fn baixar_pack_sync(
    app: Option<&AppHandle>,
    slug: &str,
    arquivos: &[ArquivoRemoto],
    preview_url: Option<&str>,
    nome: &str,
) -> Result<(), String> {
    if !slug_ok(slug) {
        return Err("ERR_PACK_SLUG".into());
    }
    if arquivos.is_empty() {
        return Err("ERR_PACK_ARQUIVO".into());
    }
    // Valida TUDO antes de criar pasta ou tocar na rede.
    for a in arquivos {
        if !arquivo_ok(&a.nome) {
            return Err("ERR_PACK_ARQUIVO".into());
        }
        if !url_ok(&a.url) {
            return Err("ERR_PACK_URL".into());
        }
    }

    let pasta = biblioteca().join(slug);
    fs::create_dir_all(&pasta).map_err(|e| format!("ERR_PACK_DIR:{e}"))?;

    let mut sha256 = BTreeMap::new();
    for a in arquivos {
        baixar(
            app,
            slug,
            &pasta.join(&a.nome),
            &a.url,
            a.bytes,
            Some(&a.sha256),
        )?;
        sha256.insert(a.nome.clone(), a.sha256.to_ascii_lowercase());
    }

    // Prévia é enfeite: falhou, o pack continua instalável.
    if let Some(url) = preview_url.filter(|u| url_ok(u)) {
        let _ = baixar(app, slug, &pasta.join("preview.mp4"), url, 0, None);
    }

    let meta = PackMeta {
        nome: nome.to_string(),
        sha256,
    };
    let json = serde_json::to_string_pretty(&meta).map_err(|e| format!("ERR_PACK_META:{e}"))?;
    fs::write(pasta.join("pack.json"), json).map_err(|e| format!("ERR_PACK_META:{e}"))
}

#[tauri::command]
pub async fn remover_pack(slug: String) -> Result<(), String> {
    crate::license::ensure_licensed()?;
    tauri::async_runtime::spawn_blocking(move || remover_pack_sync(&slug))
        .await
        .map_err(|e| format!("ERR_PACK_JOIN:{e}"))?
}

fn remover_pack_sync(slug: &str) -> Result<(), String> {
    if !slug_ok(slug) {
        return Err("ERR_PACK_SLUG".into());
    }
    let pasta = biblioteca().join(slug);
    if !pasta.is_dir() {
        return Ok(());
    }
    fs::remove_dir_all(&pasta).map_err(|e| format!("ERR_PACK_REMOVE:{e}"))
}

#[cfg(test)]
mod testes {
    use super::*;

    /// O slug vira nome de pasta e o nome de arquivo vira alvo de escrita: as
    /// duas listas são a única coisa entre o manifest remoto e o disco.
    #[test]
    fn pack_so_grava_dois_nomes_dentro_da_pasta_do_slug() {
        for slug in ["plf-01", "plf-17", "a", &"a".repeat(64)] {
            assert!(slug_ok(slug), "slug recusado: {slug}");
        }
        for slug in [
            "",
            "../x",
            "plf/01",
            "plf\\01",
            "plf 01",
            "PLF-01",
            "plf_01",
            "plf.01",
            "C:",
            "plf;whoami",
        ] {
            assert!(!slug_ok(slug), "slug perigoso aceito: {slug}");
        }
        assert!(!slug_ok(&"a".repeat(65)), "slug sem limite");

        for nome in ARQUIVOS {
            assert!(arquivo_ok(nome), "arquivo recusado: {nome}");
        }
        for nome in [
            "evil.exe",
            "../RESIDENT.rpf",
            "resident.rpf",
            "RESIDENT.rpf.exe",
            "",
            "pack.json",
        ] {
            assert!(!arquivo_ok(nome), "arquivo perigoso aceito: {nome}");
        }

        // Em release só https; http fica no dev, onde o servidor é local.
        assert!(url_ok_com(
            "https://packs.exemplo/sound/plf-01/RESIDENT.rpf",
            false
        ));
        assert!(!url_ok_com("http://packs.exemplo/x.rpf", false));
        assert!(url_ok_com("http://127.0.0.1:8080/x.rpf", true));
        for url in [
            "file:///C:/Windows/System32/x.rpf",
            "ftp://x/y.rpf",
            "",
            "//x/y",
        ] {
            assert!(!url_ok_com(url, true), "esquema perigoso aceito: {url}");
        }
    }

    /// Nada inválido chega na rede — e slug ruim não chega nem a criar pasta.
    #[test]
    fn download_recusa_antes_de_tocar_no_disco() {
        let bom = |nome: &str, url: &str| ArquivoRemoto {
            nome: nome.into(),
            url: url.into(),
            bytes: 1,
            sha256: "00".into(),
        };
        let url = "https://exemplo/x.rpf";
        assert_eq!(
            baixar_pack_sync(None, "../fora", &[bom("RESIDENT.rpf", url)], None, "x").unwrap_err(),
            "ERR_PACK_SLUG"
        );
        assert_eq!(
            baixar_pack_sync(None, "plf-01", &[bom("evil.exe", url)], None, "x").unwrap_err(),
            "ERR_PACK_ARQUIVO"
        );
        assert_eq!(
            baixar_pack_sync(None, "plf-01", &[], None, "x").unwrap_err(),
            "ERR_PACK_ARQUIVO"
        );
        assert_eq!(
            baixar_pack_sync(
                None,
                "plf-01",
                &[bom("RESIDENT.rpf", "file:///C:/x.rpf")],
                None,
                "x"
            )
            .unwrap_err(),
            "ERR_PACK_URL"
        );
        assert_eq!(remover_pack_sync("plf/01").unwrap_err(), "ERR_PACK_SLUG");
    }

    /// Pack já na biblioteca com o hash certo não é baixado de novo — é o que
    /// evita 112 MB por clique. Hash errado descarta o arquivo e rebaixa.
    #[test]
    fn reusa_arquivo_intacto_e_descarta_o_corrompido() {
        let dir = std::env::temp_dir().join(format!("plfcore-packs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let alvo = dir.join("RESIDENT.rpf");
        fs::write(&alvo, b"conteudo do pack").unwrap();
        let bytes = fs::metadata(&alvo).unwrap().len();
        let sha = hash_arquivo_com_progresso(&alvo, None, "plf-01", "RESIDENT.rpf").unwrap();

        // url vazia de propósito: se tentar baixar, o erro denuncia.
        baixar(None, "plf-01", &alvo, "", bytes, Some(&sha)).expect("devia ter reusado");
        assert!(alvo.exists());

        let erro = baixar(None, "plf-01", &alvo, "", bytes, Some(&"0".repeat(64))).unwrap_err();
        assert!(erro.starts_with("ERR_PACK_DOWNLOAD"), "erro inesperado: {erro}");
        assert!(!alvo.exists(), "arquivo corrompido tinha que ter saido");
        let _ = fs::remove_dir_all(&dir);
    }

    /// Baixa um pack do bucket de verdade e confere o que foi gravado. Depende
    /// de rede e do catálogo no ar, por isso fica de fora da suíte normal:
    /// `cargo test -- --ignored baixa_do_bucket_de_verdade --nocapture`.
    #[test]
    #[ignore]
    fn baixa_do_bucket_de_verdade() {
        let manifest = std::env::var("PLF_MANIFEST")
            .expect("defina PLF_MANIFEST com a URL do packs.json");
        let alvo_slug = std::env::var("PLF_SLUG").unwrap_or_else(|_| "plf-09".into());

        let bruto = manifest_baixar_sync(&manifest).expect("baixar o catalogo");
        let cat: serde_json::Value = serde_json::from_str(&bruto).expect("catalogo e json");
        let pack = cat["packs"]
            .as_array()
            .expect("packs e array")
            .iter()
            .find(|p| p["slug"] == alvo_slug.as_str())
            .unwrap_or_else(|| panic!("{alvo_slug} nao esta no catalogo"));

        let arquivos: Vec<ArquivoRemoto> = pack["arquivos"]
            .as_array()
            .expect("arquivos e array")
            .iter()
            .map(|a| ArquivoRemoto {
                nome: a["nome"].as_str().unwrap().to_string(),
                url: a["url"].as_str().unwrap().to_string(),
                bytes: a["bytes"].as_u64().unwrap(),
                sha256: a["sha256"].as_str().unwrap().to_string(),
            })
            .collect();
        assert_eq!(arquivos.len(), 2, "pack de som tem dois .rpf");

        let nome = pack["nome"].as_str().unwrap();
        let preview = pack["previewUrl"].as_str();
        baixar_pack_sync(None, &alvo_slug, &arquivos, preview, nome).expect("baixar o pack");

        // O que importa não é o download ter retornado Ok: é o que ficou em disco.
        let pasta = biblioteca().join(&alvo_slug);
        for a in &arquivos {
            let caminho = pasta.join(&a.nome);
            let meta = fs::metadata(&caminho).expect("arquivo gravado");
            assert_eq!(meta.len(), a.bytes, "{} com tamanho errado", a.nome);
            let sha = hash_arquivo_com_progresso(&caminho, None, &alvo_slug, &a.nome)
                .expect("hash do gravado");
            assert_eq!(sha, a.sha256.to_ascii_lowercase(), "{} corrompido", a.nome);
            println!("{} OK  {} bytes  {sha}", a.nome, meta.len());
        }
        assert!(!pasta.join("RESIDENT.rpf.parcial").exists(), "sobrou parcial");

        // pack.json é o que o sounds.ps1 lê pra conferir o pack antes de instalar.
        let meta: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(pasta.join("pack.json")).expect("pack.json"))
                .expect("pack.json e json");
        assert_eq!(meta["nome"].as_str(), Some(nome));
        for a in &arquivos {
            assert_eq!(
                meta["sha256"][&a.nome].as_str(),
                Some(a.sha256.to_ascii_lowercase().as_str()),
                "pack.json sem o hash de {}",
                a.nome
            );
        }
        println!("pack.json OK  nome={nome}");
    }
}
