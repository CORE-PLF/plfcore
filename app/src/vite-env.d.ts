/// <reference types="vite/client" />

// Endereço do packs.json no Garage, baked no build. Vazio = o app cai pro modo
// local (só a biblioteca já baixada) e mostra o selo SEM CATÁLOGO.
//
// CSP: o host desta URL está em `img-src` e `media-src` no src-tauri/tauri.conf.json —
// hoje https://web-rit9w9is79i0owd4gvz9ct7g.189.127.164.199.sslip.io, domínio provisório
// gerado pelo Coolify. SE O DOMÍNIO MUDAR, A CSP MUDA JUNTO: sem isso o <video> e a capa
// somem sem erro visível na tela, só uma violação de CSP no console.
// A nota mora aqui, e não no tauri.conf.json, porque o config é lido com serde_json puro
// (feature `config-json5` desligada no Cargo.toml) — comentário lá quebraria o build.
interface ImportMetaEnv {
  readonly VITE_PLFCORE_MANIFEST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
