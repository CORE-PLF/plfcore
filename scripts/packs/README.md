# Publicar os packs de som PLF no Garage

Pipeline de três passos: prepara → sobe → publica o catálogo.
Roda no Git Bash (Windows). Não precisa de aws-cli nem rclone — o `curl`
assina sozinho com `--aws-sigv4`.

Precisa de **ffmpeg** no PATH (`winget install Gyan.FFmpeg`) e **node**.

## Variáveis

```bash
export PLF_S3="https://s3-<id>.<host>"          # S3 API URL do Garage (upload)
export PLF_WEB="https://web-<id>.<host>"        # Web URL pública (leitura, vai no packs.json)
export PLF_AK="GK..."                            # access key
export PLF_SK="..."                              # secret key
export PLF_BUCKET="plf-packs"
export PLF_DIST="/c/tmp/plf-dist"                # saída: previews + manifest
export PLF_SONS="/c/Users/pc/Desktop/Sons PLF"   # origem: pastas "PLF 1".."PLF 17"
export PLF_ANTIGOS="/d/Github/resync-web/public/packs/manifest.json"  # opcional, detecta duplicata
```

Guarde isso em `~/.claude/.plf-garage.env` (fora de repo) e carregue antes de rodar:

```bash
set -a; . "$HOME/.claude/.plf-garage.env"; set +a
```

**Nunca commite as chaves.** Elas vivem no Coolify (serviço `garage-plf`) e no seu shell.
Nenhum script imprime `PLF_SK`.

## Passos

```bash
bash 1-empacotar.sh                       # sha256 dos .rpf + previews + manifest.json bruto
bash 2-subir.sh                           # PUT dos .rpf e das prévias no bucket
bash 3-manifest.sh                        # gera o packs.json com as URLs públicas
bash 2-subir.sh                           # sobe o packs.json (o catálogo vai por último)
```

O `3-manifest.sh` imprime `MANIFEST_URL=...` na última linha. Essa URL vai no
build do app como `VITE_PLFCORE_MANIFEST`.

## `PLF_WEB` já aponta pro bucket (sem bucket no path)

A URL de cada objeto no `packs.json` é `<PLF_WEB>/sound/<slug>/<arquivo>` —
**sem** o nome do bucket no caminho. É o mesmo padrão do Effix
(`app_effix/tools/packs/3-manifest.py`): o *web endpoint* do Garage escolhe o
bucket pelo `Host` da requisição, não pelo primeiro segmento do path.

Consequência pra trilha de infra: o domínio configurado como Web URL precisa
ser um **global alias** do bucket no Garage (`garage bucket alias plf-packs <dominio>`), senão a leitura pública devolve 404.
Já verificado no Garage real: PUT assinado em `$PLF_S3/$PLF_BUCKET/ping.json` e GET
público em `$PLF_WEB/ping.json` (sem bucket) devolveram o mesmo objeto.

O `PLF_S3` é o contrário: a S3 API é path-style, e o `2-subir.sh` monta
`$PLF_S3/$PLF_BUCKET/<key>`. Por isso `PLF_BUCKET` só é usado no upload.

## O que o passo 1 faz com o vídeo

Cada pasta `PLF N/` tem um `.mp4` de 163–201 MB (1080p, às vezes HEVC). Ele
**não** sobe cru. Vira em `$PLF_DIST/preview/`:

- `<slug>.mp4` — H.264 720p30, CRF 26, **com áudio AAC 128k**, `+faststart`
- `<slug>.jpg` — frame de 1 s, vira a capa do card

O áudio é o ponto: é pack de som, prévia muda não serve. (O Effix tira o áudio
porque lá o preview é visual.) O `+faststart` põe o índice no começo do
arquivo — sem isso o app baixa o vídeo inteiro antes do primeiro frame.

Reconverte só quando o vídeo de origem é mais novo que o convertido.

## Os `.rpf` não passam pelo dist

São 1,9 GB. O passo 1 só calcula `sha256` e tamanho; o `2-subir.sh` lê os
arquivos direto de `$PLF_SONS` usando o `caminhoLocal` do manifest bruto.
Antes de cada `.rpf` ele faz `HEAD` no objeto e pula se já existe com o mesmo
`Content-Length` — reenviar 112 MB à toa não ajuda ninguém.

## Duplicatas

O passo 1 compara o `sha256` do `RESIDENT.rpf` com o dos 17 packs antigos
(`som-01`..`som-17`) em `$PLF_ANTIGOS` e imprime `[plf-NN] DUPLICATA de som-XX`.
O pack **não** é pulado — o manifest bruto só ganha o campo `duplicataDe` pra
quem for decidir depois o que fica no catálogo.

## Estrutura no bucket

```
plf-packs/
  packs.json                          catálogo que o app lê
  sound/<slug>/RESIDENT.rpf
  sound/<slug>/WEAPONS_PLAYER.rpf
  sound/<slug>/preview.mp4
  sound/<slug>/preview.jpg
```

Slug é `plf-01`..`plf-17` (zero à esquerda); o nome exibido é `PLF 01`.

## Bucket com leitura pública

O bucket fica com `websiteAccess` ligado, como no Effix: quem descobrir a URL
baixa sem licença. Aceito — o `install` continua exigindo licença, o que está
aberto é só o download. Se um dia incomodar, o caminho é o site assinar URL de
10 minutos depois de validar a licença e fechar o acesso público. A escrita
sempre exige a chave.
