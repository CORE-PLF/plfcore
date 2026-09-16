---
name: plfcore-release
description: Publica uma nova versão do app desktop PLF CORE, de ponta a ponta — sobe o número de versão, roda os gates, compila o instalador, envia pro painel em core.proleague.com.br e confere que entrou no ar. Use sempre que a tarefa for "lançar/publicar/subir uma versão nova do app", "gerar o instalador", "colocar no site pra galera baixar" ou quando um ajuste no app precisa chegar em quem já tem instalado.
---

Você publica versões do PLF CORE. Faz a esteira inteira; não entrega pela metade e não inventa número nenhum.

Repositório: `D:\Github\plfcore`. App desktop em `app/` (Tauri 2 + Rust + React). Site/loja em `web/` (Next.js), em produção em **https://core.proleague.com.br**.

## Regras inegociáveis

1. **Checksum nunca é digitado de memória.** Sempre leia `app/artifacts/PLFCoreSetup.sha256`, que o próprio script de build gera. O servidor recalcula o SHA-256 e recusa se não bater — checksum errado = versão não salva.
2. **Gate vermelho não publica.** `npm run build` e `cargo test` precisam passar ANTES de compilar o instalador. Falhou, você para e relata.
3. **Número de versão não se repete.** Conteúdo diferente sob o mesmo número quebra o aviso de atualização dos apps instalados. Confira o que já existe antes de escolher.
4. **As 4 versões andam juntas.** Existe teste em Rust (`versao_do_cargo_bate_com_a_do_instalador`) que falha se divergirem.
5. **Nunca peça nem aceite credencial.** O painel exige ADMIN + 2FA. Se a sessão não estiver ativa, PARE e peça pro dono logar — não tente contornar.
6. **Nunca commite o instalador.** `app/artifacts/` é gitignorado de propósito; o `.exe` só é entregue por rota autenticada.

## Esteira

### 1. Escolher a versão

Versão atual no ar:
```bash
curl -s https://core.proleague.com.br/api/v1/app/version
```
Se o dono não disse o número, suba o patch a partir da maior entre a do ar e a do repositório. Nunca reaproveite número já publicado.

### 2. Subir o número nos 4 arquivos

Todos com o MESMO valor:

| arquivo | campo |
|---|---|
| `app/package.json` | `"version"` |
| `app/src-tauri/tauri.conf.json` | `"version"` |
| `app/src-tauri/Cargo.toml` | `version` (seção `[package]`) |
| `app/src/brand.ts` | `version:` |

### 3. Gates

```bash
cd D:/Github/plfcore/app && npm run build          # tsc + vite
cd D:/Github/plfcore/app/src-tauri && cargo test   # inclui o teste de versão
```

### 4. Compilar o instalador

Em PowerShell, a partir de `D:\Github\plfcore\app`:
```powershell
.\scripts\build-desktop-release.ps1 -ApiBaseUrl 'https://core.proleague.com.br' -AllowUnsigned
```
Leva ~5 min. Saída: `app\artifacts\PLFCoreSetup.exe` + `app\artifacts\PLFCoreSetup.sha256`.

`-ApiBaseUrl` é compilado no binário: errar o endereço entrega um app que não valida licença. `-AllowUnsigned` é necessário enquanto não houver certificado de code signing — **relate no resumo** que saiu `NotSigned`, porque o SmartScreen vai avisar o usuário.

### 5. Publicar pela esteira

Use a credencial de máquina, não o painel. O token vive em `PLFCORE_RELEASE_TOKEN`, variável de ambiente desta máquina.

**O token NUNCA aparece em comando, saída ou resumo.** Sempre referencie a variável (`$PLFCORE_RELEASE_TOKEN`), nunca o valor — o que você digita fica no registro da conversa.

Se a variável não existir, PARE e peça pro dono configurar (`web/deploy/RELEASE-API.md` tem o passo a passo). Não caia pro painel por conta própria.

**5.1 — enviar o instalador** (o `--data-binary @` faz streaming, não carrega 4 MB na memória):
```bash
curl -sS -X POST "https://core.proleague.com.br/api/v1/release/upload?name=PLFCoreSetup.exe" \
  -H "Authorization: Bearer $PLFCORE_RELEASE_TOKEN" \
  --data-binary @/d/Github/plfcore/app/artifacts/PLFCoreSetup.exe
```
Devolve `{fileName, sizeBytes, sha256}`. **Confira que esse `sha256` é igual ao do `.sha256` local** — se diferir, o arquivo chegou corrompido e você para aqui.

**5.2 — criar e publicar:**
```bash
curl -sS -X POST https://core.proleague.com.br/api/v1/release \
  -H "Authorization: Bearer $PLFCORE_RELEASE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @payload.json
```
com `payload.json` (escreva o arquivo, não monte JSON com aspas na linha de comando):
```json
{ "version": "1.2.3", "channel": "stable", "fileName": "PLFCoreSetup.exe",
  "checksum": "<conteúdo do .sha256>", "notes": "..." }
```

- `channel`: `stable` é o único entregue em `/download`. `beta` fica cadastrado e invisível — a resposta traz `noAr: false` quando é o caso.
- `notes`: pt-BR, voz do produto — curto, técnico, direto, sem venda e sem emoji. Descreva o efeito pra quem usa ("a aba INICIALIZAÇÃO abre na hora"), não o commit.

Respostas de erro que significam "pare e pense", não "tente de novo":
- `ERR_RELEASE_CHECKSUM` — o binário no volume não é o que você declarou.
- `ERR_RELEASE_VERSION_REUSED` — esse número já existe com outro binário. Escolha um novo; não force.
- `ERR_RELEASE_TOKEN` — credencial inválida ou revogada. Fale com o dono.
- `404` sem corpo — a esteira está desligada no servidor (sem `RELEASE_TOKEN` lá).

### 6. Conferir que entrou no ar

```bash
curl -s https://core.proleague.com.br/api/v1/app/version
```
`version` tem que ser a nova e `checksum` tem que bater, caractere por caractere, com o `.sha256` local. Não bateu = não está publicado; investigue antes de dizer que terminou.

Confira também a página `/download`, que deve mostrar o número novo.

### 7. Commit

Só o que está no repositório (o bump de versão e o que mais a tarefa mexeu), em pt-BR, `tipo(escopo): descrição`, **sem co-author**. Push só se o dono pedir.

## Resumo final

Sempre relate: versão publicada, SHA-256, resultado dos gates, estado da assinatura, e o que a verificação do passo 6 devolveu. Se algum passo não deu, diga qual e por quê — nunca declare publicado sem ter visto o endpoint responder com o número novo.
