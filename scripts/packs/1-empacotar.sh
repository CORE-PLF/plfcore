#!/usr/bin/env bash
# Prepara os 17 packs de som PLF: sha256 dos .rpf, preview.mp4/.jpg e manifest bruto.
# Os .rpf NAO sao copiados pro dist (1,9 GB) — o 2-subir.sh le direto da origem.
set -u

SONS="${PLF_SONS:-/c/Users/pc/Desktop/Sons PLF}"
OUT="${PLF_DIST:-/c/tmp/plf-dist}"
ANTIGOS="${PLF_ANTIGOS:-/d/Github/resync-web/public/packs/manifest.json}"
FFMPEG="${FFMPEG:-ffmpeg}"

[ -d "$SONS" ] || { echo "ERRO: pasta de origem nao existe: $SONS (defina PLF_SONS)" >&2; exit 1; }
command -v "$FFMPEG" >/dev/null || { echo "ERRO: ffmpeg nao esta no PATH (winget install Gyan.FFmpeg)" >&2; exit 1; }
command -v node >/dev/null || { echo "ERRO: node nao esta no PATH" >&2; exit 1; }

mkdir -p "$OUT/preview"
MAN="$OUT/manifest.json"

# sha256 -> slug dos 17 packs antigos (som-01..som-17), pra avisar duplicata.
DUP="$OUT/.antigos-sha.txt"
: > "$DUP"
if [ -f "$ANTIGOS" ]; then
  node -e '
    const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const p of m.packs || []) {
      const slug = String(p.resident?.url || "").split("/")[0] || p.nome || p.id;
      if (p.resident?.sha256) console.log(p.resident.sha256 + " " + slug);
    }
  ' "$ANTIGOS" >> "$DUP" || echo "AVISO: nao consegui ler $ANTIGOS" >&2
else
  echo "AVISO: manifest antigo nao encontrado ($ANTIGOS) — deteccao de duplicata desligada" >&2
fi

n_packs=0; n_gerados=0; n_reusados=0; n_dups=0; falhas=0

echo '{"versao":1,"packs":[' > "$MAN"
primeiro=1

for dir in "$SONS"/*/; do
  nome_dir=$(basename "$dir")
  num=$(echo "$nome_dir" | tr -dc '0-9')
  [ -n "$num" ] || { echo "SKIP sem numero no nome: $nome_dir" >&2; continue; }
  slug=$(printf 'plf-%02d' "$num")
  nome=$(printf 'PLF %02d' "$num")

  res=$(find "$dir" -maxdepth 2 -iname 'RESIDENT.rpf' | head -1)
  wep=$(find "$dir" -maxdepth 2 -iname 'WEAPONS_PLAYER.rpf' | head -1)
  if [ -z "$res" ] || [ -z "$wep" ]; then
    echo "SKIP $slug: faltando RESIDENT.rpf ou WEAPONS_PLAYER.rpf em $nome_dir" >&2
    falhas=$((falhas+1)); continue
  fi

  res_b=$(stat -c %s "$res"); wep_b=$(stat -c %s "$wep")
  echo ">> $slug sha256..." >&2
  res_s=$(sha256sum "$res" | cut -d' ' -f1)
  wep_s=$(sha256sum "$wep" | cut -d' ' -f1)

  dup=$(awk -v s="$res_s" '$1==s{print $2; exit}' "$DUP")
  if [ -n "$dup" ]; then
    echo "[$slug] DUPLICATA de $dup (mesmo RESIDENT.rpf)" >&2
    n_dups=$((n_dups+1))
  fi

  # o nome do .mp4 varia de caixa ("PLF 1.mp4" / "plf 13.mp4"); pega o unico da raiz
  src=$(find "$dir" -maxdepth 1 -iname '*.mp4' | head -1)
  mp4="$OUT/preview/$slug.mp4"; jpg="$OUT/preview/$slug.jpg"
  if [ -n "$src" ]; then
    if [ ! -s "$mp4" ] || [ ! -s "$jpg" ] || [ "$src" -nt "$mp4" ]; then
      echo ">> $slug preview..." >&2
      # COM audio: e pack de som, a previa muda sem som. +faststart pro app
      # comecar a tocar sem baixar o arquivo inteiro.
      if "$FFMPEG" -v error -y -i "$src" -vf 'scale=-2:720' -r 30 \
           -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p \
           -c:a aac -b:a 128k -movflags +faststart "$mp4" < /dev/null; then
        n_gerados=$((n_gerados+1))
      else
        echo "FALHOU preview $slug" >&2; falhas=$((falhas+1))
      fi
      "$FFMPEG" -v error -y -ss 1 -i "$src" -frames:v 1 -q:v 3 "$jpg" < /dev/null \
        || { echo "FALHOU capa $slug" >&2; falhas=$((falhas+1)); }
    else
      n_reusados=$((n_reusados+1))
    fi
  else
    echo "AVISO $slug: sem .mp4 de origem, pack fica sem previa" >&2
    src=""
  fi

  [ $primeiro -eq 1 ] && primeiro=0 || echo ',' >> "$MAN"
  printf '{"slug":"%s","nome":"%s","bytes":%s,"arquivos":[{"nome":"RESIDENT.rpf","caminhoLocal":"%s","bytes":%s,"sha256":"%s"},{"nome":"WEAPONS_PLAYER.rpf","caminhoLocal":"%s","bytes":%s,"sha256":"%s"}],"videoOrigem":"%s"' \
    "$slug" "$nome" "$((res_b + wep_b))" \
    "$res" "$res_b" "$res_s" \
    "$wep" "$wep_b" "$wep_s" \
    "$src" >> "$MAN"
  [ -n "$dup" ] && printf ',"duplicataDe":"%s"' "$dup" >> "$MAN"
  printf '}' >> "$MAN"
  n_packs=$((n_packs+1))
done

echo ']}' >> "$MAN"
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$MAN" \
  || { echo "ERRO: manifest bruto saiu invalido: $MAN" >&2; exit 1; }

echo "" >&2
echo "=== RESUMO ===" >&2
echo "packs:      $n_packs" >&2
echo "previews:   $n_gerados gerados, $n_reusados reusados" >&2
echo "duplicatas: $n_dups" >&2
echo "falhas:     $falhas" >&2
echo "manifest:   $MAN" >&2
[ "$falhas" -eq 0 ] || exit 1
