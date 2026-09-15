use std::fmt::Write as _;

/// Chave do XOR dos scripts PowerShell. Vive no binário de qualquer forma —
/// o objetivo é derrotar `strings`/dump estático, não criptoanálise.
const PS_KEY: [u8; 32] = [
    0x7A, 0x11, 0xC3, 0x5E, 0x9D, 0x40, 0xF2, 0x88, 0x31, 0xB7, 0x04, 0xE9, 0x5C, 0xD1, 0x26,
    0x6F, 0x93, 0x0A, 0xBE, 0x47, 0xE0, 0x18, 0x75, 0xAC, 0x52, 0xC9, 0x3D, 0x81, 0xF6, 0x2B,
    0x64, 0x9F,
];

const PS_FILES: &[&str] = &[
    "apply",
    "debloat",
    "fivem",
    "fpsboost",
    "gameconfig",
    "gamepaths",
    "games",
    "input",
    "inventory",
    "peripherals",
    "runtimes",
    "startup",
    "tweaks",
];

/// Keystream splitmix64 sobre a chave + posição; seed varia com o tamanho pra
/// dois arquivos não compartilharem keystream. Simétrico (XOR): cifra = decifra.
fn ps_xor(data: &mut [u8], key: &[u8; 32]) {
    let mut s = u64::from_le_bytes(key[..8].try_into().unwrap()) ^ data.len() as u64;
    for (i, b) in data.iter_mut().enumerate() {
        s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = s;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        *b ^= (z as u8) ^ key[i % 32];
    }
}

/// Gera OUT_DIR/ps_enc.rs: blobs cifrados + decodificador. commands.rs faz include!.
fn gerar_ps_enc() {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR");
    let mut src = String::new();
    writeln!(src, "static PS_KEY: [u8; 32] = {PS_KEY:?};").unwrap();
    src.push_str(
        r#"
fn ps_xor(data: &mut [u8], key: &[u8; 32]) {
    let mut s = u64::from_le_bytes(key[..8].try_into().unwrap()) ^ data.len() as u64;
    for (i, b) in data.iter_mut().enumerate() {
        s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = s;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        *b ^= (z as u8) ^ key[i % 32];
    }
}

fn ps_decode(parts: &[&[u8]]) -> String {
    let mut out = String::new();
    for (n, part) in parts.iter().enumerate() {
        if n > 0 {
            out.push('\n');
        }
        let mut buf = part.to_vec();
        ps_xor(&mut buf, &PS_KEY);
        out.push_str(&String::from_utf8(buf).expect("script cifrado corrompido"));
    }
    out
}
"#,
    );
    for name in PS_FILES {
        let path = format!("src/{name}.ps1");
        println!("cargo:rerun-if-changed={path}");
        let mut bytes = std::fs::read(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
        ps_xor(&mut bytes, &PS_KEY);
        writeln!(
            src,
            "static ENC_{}: &[u8] = &{bytes:?};",
            name.to_ascii_uppercase()
        )
        .unwrap();
    }
    std::fs::write(std::path::Path::new(&out_dir).join("ps_enc.rs"), src)
        .expect("escrever ps_enc.rs");
}

fn main() {
    gerar_ps_enc();
    let manifest = r#"
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity
        type="win32"
        name="Microsoft.Windows.Common-Controls"
        version="6.0.0.0"
        processorArchitecture="*"
        publicKeyToken="6595b64144ccf1df"
        language="*"
      />
    </dependentAssembly>
  </dependency>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
"#;
    let windows = tauri_build::WindowsAttributes::new().app_manifest(manifest);
    let attributes = tauri_build::Attributes::new().windows_attributes(windows);
    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
