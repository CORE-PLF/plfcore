#!/usr/bin/env bash
# Sobe os packs PLF pro bucket Garage. curl assina sozinho com --aws-sigv4;
# nao precisa de aws-cli nem rclone.
# Precisa: PLF_S3, PLF_AK, PLF_SK, PLF_DIST, PLF_SONS (PLF_BUCKET tem padrao).
set -u

S3="${PLF_S3:?defina PLF_S3 com a S3 API URL do Garage}"
AK="${PLF_AK:?defina PLF_AK com a access key}"
SK="${PLF_SK:?defina PLF_SK com a secret key}"
BUCKET="${PLF_BUCKET:-plf-packs}"
DIST="${PLF_DIST:?defina PLF_DIST com a pasta de saida do passo 1}"
SONS="${PLF_SONS:?defina PLF_SONS com a pasta de origem dos packs}"

S3="${S3%/}"
MAN="$DIST/manifest.json"
[ -f "$MAN" ] || { echo "ERRO: $MAN nao existe. Rode o 1-empacotar.sh antes." >&2; exit 1; }
command -v node >/dev/null || { echo "ERRO: node nao esta no PATH" >&2; exit 1; }

enviados=0; pulados=0; falhas=0

put() { # <arquivo> <key> <content-type>
  local file="$1" key="$2" ct="$3" mb code
  [ -s "$file" ] || { echo "!!! FALTANDO: $file ($key)" >&2; falhas=$((falhas+1)); return 1; }
  mb=$(( $(stat -c %s "$file") / 1048576 ))
  printf '%-44s %5s MB ... ' "$key" "$mb"
  code=$(curl -s --retry 3 --retry-delay 5 --max-time 3600 -o /dev/null -w '%{http_code}' \
    -X PUT --aws-sigv4 "aws:amz:garage:s3" --user "$AK:$SK" \
    -H "Content-Type: $ct" -T "$file" "$S3/$BUCKET/$key")
  echo "$code"
  case "$code" in
    2??) enviados=$((enviados+1)) ;;
    *) echo "!!! FALHOU: $key (HTTP $code)" >&2; falhas=$((falhas+1)); return 1 ;;
  esac
}

# .rpf tem 112 MB e nunca muda: se ja esta no bucket com o mesmo tamanho, pula.
ja_no_bucket() { # <arquivo> <key>
  local file="$1" key="$2" resp code len
  resp=$(curl -s --head --retry 2 --retry-delay 3 --max-time 120 \
    --aws-sigv4 "aws:amz:garage:s3" --user "$AK:$SK" "$S3/$BUCKET/$key" 2>/dev/null) || return 1
  code=$(printf '%s\n' "$resp" | head -1 | awk '{print $2}')
  [ "$code" = "200" ] || return 1
  len=$(printf '%s\n' "$resp" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}' | tail -1)
  [ "$len" = "$(stat -c %s "$file")" ]
}

# slug TAB nome-do-arquivo TAB caminho-local
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  for (const p of m.packs) for (const a of p.arquivos)
    console.log([p.slug, a.nome, a.caminhoLocal].join("\t"));
' "$MAN" > "$DIST/.upload-lista.txt"

while IFS=$'\t' read -r slug arq caminho; do
  [ -n "$slug" ] || continue
  key="sound/$slug/$arq"
  if [ ! -s "$caminho" ]; then
    echo "!!! FALTANDO na origem ($SONS): $caminho" >&2; falhas=$((falhas+1)); continue
  fi
  if ja_no_bucket "$caminho" "$key"; then
    printf '%-44s ja no bucket\n' "$key"; pulados=$((pulados+1)); continue
  fi
  put "$caminho" "$key" "application/octet-stream" || true
done < "$DIST/.upload-lista.txt"

for slug in $(cut -f1 "$DIST/.upload-lista.txt" | sort -u); do
  put "$DIST/preview/$slug.mp4" "sound/$slug/preview.mp4" "video/mp4" || true
  put "$DIST/preview/$slug.jpg" "sound/$slug/preview.jpg" "image/jpeg" || true
done

# catalogo por ultimo: so aparece pro app quando tudo ja esta no ar
if [ -f "$DIST/packs.json" ]; then
  put "$DIST/packs.json" "packs.json" "application/json" || true
else
  echo "AVISO: $DIST/packs.json nao existe — rode o 3-manifest.sh e depois este script de novo" >&2
fi

echo ""
echo "=== RESUMO ==="
echo "enviados: $enviados"
echo "pulados:  $pulados"
echo "falhas:   $falhas"
[ "$falhas" -eq 0 ] || exit 1
