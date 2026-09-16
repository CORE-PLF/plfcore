# Plano — Sons PLF na garagem (catálogo remoto + download + instalação)

Objetivo: os 17 packs de `C:\Users\pc\Desktop\Sons PLF` publicados num Garage (S3) no Coolify da jogueone, e o PLF Core baixando, mostrando prévia com áudio e instalando no GTA. O Effix é só a referência da mecânica — os sons são os PLF.

## O que já está pronto (não refazer)

| Peça | Onde | Estado |
|---|---|---|
| Instalação no GTA | `app/src-tauri/src/sounds.ps1` | Troca `RESIDENT.rpf` + `WEAPONS_PLAYER.rpf`, backup do vanilla, sha256 por arquivo, tmp+rename, recusa com jogo aberto. Testado ida e volta no GTA real (Enhanced) |
| Comandos Rust | `commands.rs` (`scan_sounds`, `install_sound_pack`, `restore_sounds`) | Atrás de `ensure_licensed()` |
| Painel | `app/src/modules/games/SoundsPanel.tsx` | Lista a biblioteca local, armar + segurar, RESTAURAR ORIGINAL |
| Biblioteca local | `%LOCALAPPDATA%\PLFCore\packs\<id>\{RESIDENT.rpf, WEAPONS_PLAYER.rpf, pack.json, preview.mp4}` | É o layout que o download vai preencher |
| Referência Effix | `IZPOVI/app_effix/tools/packs/{1-empacotar.sh,2-subir.sh,3-manifest.py,README.md}` e `src-tauri/src/packs.rs` (`baixar`, `manifest_baixar`) | Copiar a mecânica, não o produto |
| Coolify jogueone | 3 serviços Garage já rodando (`garage-one-bio`, `garage-kush`, `garage-kushprofiles`), imagem `dxflrs/garage:v2.1.0` | O padrão da casa é um Garage por produto |
| ffmpeg | instalado (9.0.1, winget) | Necessário pro preview |

## O material

17 pastas `PLF N/` com `Sons N/{RESIDENT.rpf, WEAPONS_PLAYER.rpf}` + `PLF N.mp4`. Total 4,9 GB.

- `.rpf`: 112.784.384 + 3.882.496 bytes em todos, header `RPF7` igual ao vanilla do GTA V Enhanced instalado em `D:\SteamLibrary` — mesma assinatura dos packs testados ontem. Compatível.
- Vídeos: 163–201 MB cada (3,1 GB). **Não sobem crus.** Vão pra 720p30 H.264 `+faststart` — e, diferente do Effix, **com o áudio** (AAC): é pack de som, a prévia sem som não serve pra nada.
- Possível sobreposição com os 17 de ontem (`PLF 13` tem a mesma data do `PureMode 6`). O empacotador compara sha256 com `resync-web/public/packs/manifest.json` e avisa duplicata.

## Decisões (premissas — mudar se discordar)

1. **Garage novo, dedicado**: serviço `garage-plf` no Coolify jogueone, bucket `plf-packs`. Isola 2,2 GB de packs dos dados de bio/kush, chave própria, URL própria. Mesmo one-click dos outros três.
2. **Bucket com leitura pública** (`websiteAccess`), como no Effix. Quem descobrir a URL baixa sem licença — aceito, igual lá. Caminho de upgrade se incomodar: o site PLF assina URL de 10 min depois de validar a licença, e o bucket fecha. O `install` já exige licença; o que fica aberto é só o download.
3. **Sem zip.** Effix zipa o par; aqui os dois `.rpf` sobem crus, um objeto cada. O Rust baixa direto pro layout da biblioteca e o `sounds.ps1` já confere o sha256 de cada arquivo. Menos uma dependência (zip) e menos um passo (extrair).
4. **Manifest URL** baked no app como `VITE_PLFCORE_MANIFEST` (build), igual ao `VITE_EFFIX_MANIFEST`. Buscado pelo Rust (`reqwest`, já no `Cargo.toml`) — o Garage não manda CORS e o fetch da webview seria bloqueado.
5. **Geração**: manifest declara `"geracao": ["enhanced"]` (o que está verificado). O app esconde pack cuja lista não inclui a geração detectada. Testar em Legacy depois e acrescentar.
6. Chaves S3 ficam em `~/.claude/.plf-garage.env` (fora de repo) e no Coolify. Nunca no git.

## Contrato do `packs.json` (travar antes de começar as trilhas)

```json
{
  "versao": 1,
  "packs": [
    {
      "slug": "plf-01",
      "nome": "PLF 01",
      "geracao": ["enhanced"],
      "bytes": 116666880,
      "arquivos": [
        { "nome": "RESIDENT.rpf",       "url": "<WEB>/sound/plf-01/RESIDENT.rpf",       "bytes": 112784384, "sha256": "…" },
        { "nome": "WEAPONS_PLAYER.rpf", "url": "<WEB>/sound/plf-01/WEAPONS_PLAYER.rpf", "bytes": 3882496,   "sha256": "…" }
      ],
      "previewUrl": "<WEB>/sound/plf-01/preview.mp4",
      "capaUrl":    "<WEB>/sound/plf-01/preview.jpg"
    }
  ]
}
```

Layout no bucket: `plf-packs/packs.json` + `plf-packs/sound/<slug>/{RESIDENT.rpf, WEAPONS_PLAYER.rpf, preview.mp4, preview.jpg}`.

O Rust só grava arquivo cujo `nome` está em `{RESIDENT.rpf, WEAPONS_PLAYER.rpf}` e cujo slug bate `^[a-z0-9-]{1,64}$` — mesma lista fechada do `sounds.ps1`.

## Trilhas

**A — Infra (Coolify).** Criar `garage-plf` (one-click Garage), domínio pra Web URL (ex.: `packs.plfcore.<dominio>` ou a URL gerada), e dentro do container: `garage layout assign` + `apply`, `garage bucket create plf-packs`, `garage key create plf-uploader`, `bucket allow --read --write`, `bucket website --allow`. Guardar S3 URL, Web URL, AK/SK no env fora do repo. **Checar disco do servidor antes** (2,2 GB de packs + ~150 MB de prévias). Ação em produção: confirmar antes de criar.

**B — Pipeline (`scripts/packs/`).** Adaptar os três do Effix, sem os tipos que não existem aqui:
- `1-empacotar.sh`: percorre `Sons PLF/PLF N/`, slug `plf-NN`, sha256 dos dois `.rpf`, ffmpeg → `preview.mp4` (720p30, H.264, **AAC 128k**, `+faststart`) e `preview.jpg` (frame de 1 s), escreve `dist/manifest.json` bruto. Reconverte só se o vídeo de origem for mais novo. Avisa duplicata contra os packs de ontem.
- `2-subir.sh`: `curl --aws-sigv4 "aws:amz:garage:s3"` PUT dos `.rpf` (`application/octet-stream`), prévias e por último o `packs.json`. Pula `.rpf` já no bucket com mesmo tamanho (`HEAD`).
- `3-manifest.py` (ou `.js`): monta URLs públicas + `packs.json` no contrato acima; imprime `MANIFEST_URL=`.
- Roda local até o passo 1 sem esperar A; o upload espera A.

**C — Backend do app (`app/src-tauri/src/packs.rs`, novo).** Portar de `packs.rs` do Effix só `manifest_baixar` e `baixar`: stream com `reqwest::blocking`, sha256 no fluxo, `.parcial` + rename, evento `pack-progress {slug, pct, receivedBytes, totalBytes}`, reuso do cache se tamanho e hash batem. Destino: direto na biblioteca (`%LOCALAPPDATA%\PLFCore\packs\<slug>\`), e ao terminar grava o `pack.json` (`nome`, `sha256` por arquivo) que o `sounds.ps1` já lê. Comandos: `manifest_baixar(url)`, `baixar_pack(slug)`, `remover_pack(slug)` (libera disco). `ensure_licensed()` nos dois últimos. Teste Rust: allowlist de nome de arquivo e slug, igual ao `som_so_troca_os_dois_rpf…`.

**D — UI (`SoundsPanel.tsx` + `games.css` + `i18n.ts`).** Vira catálogo: grade de cards (padrão do `ModuleScreen.tsx` do Effix) com capa, vídeo que toca ao passar o mouse **com som**, tamanho, estado (`NA NUVEM` → `BAIXANDO n%` → `BAIXADO` → `INSTALADO`). Barra de download segmentada. BAIXAR livre; INSTALAR continua armar + segurar; RESTAURAR ORIGINAL continua sempre visível; aviso de pure mode continua. Sem manifest (offline) mostra a biblioteca local com selo `SEM CONEXÃO`. `tauri.conf.json`: CSP ganha `media-src` e `img-src` com a Web URL do Garage — sem isso o `<video>` é bloqueado. Adapter: `fetchCatalog()`, `downloadPack(slug, onProgress)`, `removePack(slug)` nas três camadas (mock com progresso fake).

**E — Verificação real.** Na máquina do usuário: manifest carrega → card mostra capa e prévia toca com áudio → BAIXAR um pack (progresso real, hash confere) → INSTALAR → `RESIDENT.rpf` do GTA = hash do pack → RESTAURAR → hash volta ao vanilla `5b3313e0…`. Depois, `cargo test`, `tsc -b`, `npm run build`. Fechar com commit.

### Paralelismo

A ∥ B (passo 1) ∥ C ∥ D — nenhuma toca o arquivo da outra. B (upload) espera A. E espera todas. C e D só dependem do contrato acima, já travado.

## O que fica de fora

- Assinatura de URL sob demanda pelo site (premissa 2 — só se o vazamento incomodar).
- Patch binário entre packs (`zstd --patch-from`): os 17 compartilham a base vanilla, cortaria 112 MB pra poucos MB por pack. Só se a banda doer.
- Legacy: não testado. Fica fail-closed até alguém rodar num Legacy.
- Os 17 packs de ontem (`som-01..17`) continuam na biblioteca local; entram no bucket só se não forem duplicata destes.

---

## Trilha A — FEITA (2026-09-16)

Serviço `garage-plf` criado no Coolify jogueone, projeto `one-pvp`, ambiente `production`, imagem `dxflrs/garage:v2.1.0`. Status `running:healthy`.

| Item | Valor |
|---|---|
| Serviço (uuid) | `sl5i3tqqzoreutz9sw3jp6zh` |
| S3 API (upload, assinado) | `https://s3-rit9w9is79i0owd4gvz9ct7g.189.127.164.199.sslip.io` |
| Web (leitura pública) | `https://web-rit9w9is79i0owd4gvz9ct7g.189.127.164.199.sslip.io` |
| Admin API | `https://admin-rit9w9is79i0owd4gvz9ct7g.189.127.164.199.sslip.io` |
| Bucket | `plf-packs` |
| Chave | `plf-uploader` (read+write+owner) |

Configuração feita pela Admin API do Garage (o Coolify não expõe exec): layout do nó em `dc1` com 20 GB, `ApplyClusterLayout` v1, `CreateBucket`, `CreateKey`, `AllowBucketKey`, `UpdateBucket` com `websiteAccess`.

**Pegadinha resolvida:** o Garage resolve o bucket pelo **hostname**, não pelo path. Foi preciso um `AddBucketAlias` com o próprio host da Web URL. Consequência no contrato:

- upload (S3, path-style): `$PLF_S3/$PLF_BUCKET/sound/<slug>/RESIDENT.rpf`
- leitura pública (Web): `$PLF_WEB/sound/<slug>/RESIDENT.rpf` — **sem bucket no path**

**Verificado de verdade:** PUT de um `RESIDENT.rpf` real de 112.784.384 bytes → HTTP 200 em 14 s (8,2 MB/s). GET público sem credencial → sha256 idêntico ao da origem, 9 s (12 MB/s). Objetos de teste apagados depois (HTTP 204). Os 17 packs devem levar ~4 min de upload.

Credenciais em `~/.claude/.plf-garage.env` (chmod 600, fora de qualquer repo): `PLF_S3`, `PLF_WEB`, `PLF_ADMIN`, `PLF_ADMIN_TOKEN`, `PLF_AK`, `PLF_SK`, `PLF_BUCKET`, `PLF_BUCKET_ID`, `PLF_SERVICE_UUID`.

**Disco:** a API do Coolify não expõe espaço livre. Em vez de adivinhar, validei subindo um pack real inteiro — passou. O `2-subir.sh` falha com erro claro se faltar espaço no meio, e sobe incremental.

**Achado:** o `RESIDENT.rpf` de `PLF 1` tem sha256 `85f37e31…`, o mesmo do `som-01` publicado ontem. A suspeita de sobreposição entre as duas coleções se confirma em pelo menos um pack — a detecção de duplicata da trilha B vai dizer quantos.

**Domínio provisório:** o `sslip.io` é o que o Coolify gerou. Se um dia virar um domínio próprio, muda em três lugares: o alias do bucket no Garage, a CSP do `tauri.conf.json` e o `packs.json` (que é regerado pelo `3-manifest.sh`).

---

## Correção: era LEGACY, não Enhanced (2026-09-16)

O dono avisou que os packs são pra GTA V Legacy. Estava certo, e isso expôs três bugs meus.

**Como se confirma, sem depender de opinião:** o `RESIDENT.rpf` dos packs tem 112.784.384 bytes e o `WEAPONS_PLAYER.rpf`, 3.882.496 — exatamente o tamanho do vanilla do **Legacy**. O Enhanced tem 112.785.408 e 3.883.008. O header RPF é igual nas duas gerações, então ele não servia de prova; o tamanho serve.

### Bug 1 — o alvo era o GTA errado

`Get-Gta5Path` procura Enhanced primeiro (appid 3240220). Nesta máquina existem as duas gerações, e o FiveM aponta pro Legacy:

```
CitizenFX.ini -> IVPath=D:\SteamLibrary\steamapps\common\Grand Theft Auto V
```

Ou seja: o teste de ontem trocou os `.rpf` de um GTA que o FiveM nem abre.

Agora `Get-SndAlvo` tem prioridade explícita: **IVPath do CitizenFX.ini** (o GTA que o FiveM carrega) → Legacy instalado → Enhanced. O scan devolve `alvoOrigem` (`fivem` ou `instalado`) pra tela dizer de onde veio a escolha.

### Bug 2 — um backup só pras duas gerações

`backup\sounds\` era único. Com o alvo corrigido, o backup do Enhanced (gravado ontem) seria usado pra restaurar o Legacy — entregando um `.rpf` que o jogo não carrega. Agora é `backup\sounds\<geracao>\`, e o backup antigo foi movido pra `backup\sounds\enhanced\`.

### Bug 3 — o app gravaria um mod como se fosse o original

O Legacy desta máquina **já tinha** um pack instalado à mão (`85f37e31…` = plf-01/som-01). Como não havia backup, a primeira instalação teria copiado esse mod pra `backup\` com o rótulo de "original", e o caminho de volta ao vanilla sumiria em silêncio — a pessoa só descobriria ao tentar restaurar.

`Save-SndBackup` agora confere o que está no jogo contra os sha256 de todos os packs da biblioteca antes de guardar. Reconheceu um pack, recusa com `ERR_SND_NAO_VANILLA` e não escreve nada. Verificado: a instalação parou, o jogo não foi tocado, nenhum backup falso foi criado.

O scan também ganhou `vanillaSumiu`: tem mod no jogo e não tem backup. A tela avisa e bloqueia a instalação até a pessoa recuperar o original pela Steam.

`instaladoId` passou a ser decidido pelo **hash do arquivo que está no jogo**, não pelo que o app anotou. Pack instalado por fora aparece como instalado — o app não finge que o jogo está limpo.

### Catálogo

`3-manifest.sh` declara `"geracao": ["legacy"]`, `packs.json` regerado e republicado. Os 17 packs continuam os mesmos objetos no bucket; só o catálogo mudou.

### O que ainda não dá pra testar aqui

O ciclo instalar → restaurar **no Legacy** exige o vanilla do Legacy, e ele não existe nesta máquina: o jogo está modificado e o `mods_som\padrao\` guardado é o vanilla do **Enhanced** (112.785.408), não do Legacy. Recuperar pela Steam (Propriedades → Arquivos instalados → Verificar integridade) e então rodar o ciclo.
