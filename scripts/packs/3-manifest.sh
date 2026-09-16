#!/usr/bin/env bash
# Monta o packs.json que o app le, com as URLs publicas do Garage.
# O bucket esta com leitura publica: nao ha assinatura e nada expira.
# Precisa: PLF_WEB, PLF_DIST.
set -u

WEB="${PLF_WEB:?defina PLF_WEB com a Web URL publica do Garage}"
DIST="${PLF_DIST:-/c/tmp/plf-dist}"
WEB="${WEB%/}"

MAN="$DIST/manifest.json"
[ -f "$MAN" ] || { echo "ERRO: $MAN nao existe. Rode o 1-empacotar.sh antes." >&2; exit 1; }
command -v node >/dev/null || { echo "ERRO: node nao esta no PATH" >&2; exit 1; }

node -e '
  const fs = require("fs");
  const [man, web, dist] = process.argv.slice(1);
  const bruto = JSON.parse(fs.readFileSync(man, "utf8"));
  const packs = bruto.packs.map((p) => ({
    slug: p.slug,
    nome: p.nome,
    // so "enhanced" esta verificado; o app esconde pack que nao bate com a geracao detectada
    geracao: ["enhanced"],
    bytes: p.bytes,
    arquivos: p.arquivos.map((a) => ({
      nome: a.nome,
      url: `${web}/sound/${p.slug}/${a.nome}`,
      bytes: a.bytes,
      sha256: a.sha256,
    })),
    previewUrl: `${web}/sound/${p.slug}/preview.mp4`,
    capaUrl: `${web}/sound/${p.slug}/preview.jpg`,
  }));
  const saida = `${dist}/packs.json`;
  fs.writeFileSync(saida, JSON.stringify({ versao: 1, packs }, null, 2), "utf8");
  console.error(`${packs.length} packs -> ${saida}`);
' "$MAN" "$WEB" "$DIST"

echo "MANIFEST_URL=$WEB/packs.json"
