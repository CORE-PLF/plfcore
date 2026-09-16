# AMBIENTE DE TESTES (STAGING) NO COOLIFY

Um clone do site com **banco próprio e dados de mentira**, para testar painel, checkout e licença sem chegar perto de produção. Mesmo repositório, mesmo `Dockerfile` — muda o banco, o domínio e os segredos.

Produção está em `COOLIFY.md`; as variáveis de produção, em `ENV-PRODUCTION.md`. Aqui só o que é diferente.

**Duas regras que não se negociam:**

- **Segredo de produção NÃO entra em staging.** `AUTH_SECRET`, `ENCRYPTION_KEY`, `PAYMENT_WEBHOOK_SECRET`, token do Mercado Pago, chaves do Discord, `RELEASE_TOKEN`, SMTP: tudo novo. Staging é um ambiente com senha conhecida e conta de mentira — qualquer segredo compartilhado vira um caminho para dentro da produção.
- **`PAYMENT_PROVIDER=sandbox`, sempre.** Staging não conversa com dinheiro real.

## 1. MySQL de staging

1. **+ New → Database → MySQL** (versão 8), no mesmo projeto ou num projeto "staging" separado.
2. Senha forte (própria, não a de produção) e nome de banco distinto — ex.: `resync_staging`.
3. Anote a URL interna: `mysql://usuario:senha@nome-do-servico-staging:3306/resync_staging`. **Confira o hostname**: se ele apontar para o serviço MySQL de produção, você acabou de apontar o staging para os dados reais.
4. Backup: não precisa. O banco é descartável — se sujar, apague e rode o seed de novo.

## 2. Aplicação web de staging

1. **+ New → Application → mesmo repositório Git**, mesma branch (`master`), base directory na raiz.
2. Build Pack: **Dockerfile** (o mesmo de produção).
3. Porta exposta: `3000`. Healthcheck: `GET /api/health`.
4. **Custom start command: deixe VAZIO.** O Coolify não sobrescreve o `CMD` de imagem com Dockerfile — o processo é escolhido pela variável `PROCESS` (`start` = site, `worker` = fila). O padrão da imagem já é `start`.
5. Nome que não dê para confundir no painel do Coolify: `plfcore-web-staging`.

## 3. Pre-deployment — migrations

Em **Pre-deployment command** da aplicação de staging, igual à produção:

```bash
npx prisma migrate deploy
```

Roda antes do app subir, a cada deploy. Uma instância só.

## 4. Domínio + HTTPS

1. Sugestão: `staging.core.proleague.com.br`.
2. DNS: registro **A** `staging.core` → **o mesmo IP da VPS** onde a produção já roda (ou `AAAA`, se IPv6). Se o DNS estiver no Cloudflare, deixe **DNS only** (nuvem cinza) até o certificado sair — o Let's Encrypt valida por HTTP.
3. Configure o domínio na aplicação (com `https://`). O proxy do Coolify emite e renova o certificado.
4. `APP_URL` tem que ser **idêntica** ao domínio configurado, com `https://` e sem barra no fim.

## 5. Variáveis de ambiente

Lista completa. Coluna "de onde vem" é o que importa — nada marcado como NOVO pode ser copiado de produção.

### Obrigatórias

| Variável | Valor em staging |
| --- | --- |
| `DATABASE_URL` | **STAGING** — URL interna do MySQL do passo 1. Nunca a de produção |
| `AUTH_SECRET` | **NOVO** — `openssl rand -base64 32`. Compartilhar com produção = cookie de sessão de um ambiente valendo no outro |
| `ENCRYPTION_KEY` | **NOVO** — `openssl rand -base64 24` (32 chars). Cifra chave de licença e assina o cookie de 2FA; tem que ser independente da produção |
| `PAYMENT_WEBHOOK_SECRET` | **NOVO** — qualquer valor forte; em `sandbox` só assina o webhook simulado |

### Com default (ajuste explicitamente)

| Variável | Valor em staging |
| --- | --- |
| `APP_URL` | **STAGING** — `https://staging.core.proleague.com.br` |
| `NODE_ENV` | `production` — já vem da imagem, não precisa cadastrar. É a mesma build de produção rodando |
| `PAYMENT_PROVIDER` | `sandbox` — obrigatório. Nunca `mercadopago` |
| `PROCESS` | `start` (padrão da imagem). Só o worker do passo 7 usa `worker` |

### Pode ficar vazia (e é o recomendado)

| Variável | Por quê |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Vazia. Se quiser testar o fluxo do MP, use o token de **TESTE** da aplicação, nunca o de produção |
| `MERCADOPAGO_COLLECTOR_ID` | Vazia |
| `RELEASE_TOKEN` | Vazia (rotas de release viram 404). Se precisar testá-las: **NOVO** token com 32+ chars |
| `REDIS_URL` | Vazia — não usada na v1 |
| `INSTALLERS_DIR` | Padrão `/data/installers`. Só mexa se montar Storage em outro caminho |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` / `DISCORD_PUBLIC_KEY` | Vazias = login Discord desligado, site funciona. Para testar: **aplicação Discord separada**, com redirect `https://staging.core.proleague.com.br/api/auth/discord/callback`. Nunca as credenciais do bot de produção — ele mexe em cargo de gente real |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Vazias: e-mail vira log no console. **Não** aponte para o SMTP de produção — staging manda e-mail para endereço de mentira |

### Não cadastre no painel

`STAGING_ADMIN_EMAIL` e `STAGING_ADMIN_PASSWORD` são lidas só pelo seed (passo 8) e passam na linha de comando, na hora. Não precisam ficar salvas na aplicação.

## 6. Primeiro deploy

Deploy → acompanhe o log → `https://staging.core.proleague.com.br/api/health` e `/api/ready` respondendo. `/api/ready` em 503 = `DATABASE_URL` errada ou migration não rodou.

## 7. Worker de staging (opcional)

Só se for testar e-mail, DM do Discord ou expiração de licença. **+ New → Application**, mesmo repositório/Dockerfile, MESMAS variáveis, mais `PROCESS=worker`. Sem domínio, sem porta, sem pre-deployment command (migration é só do web).

## 8. Seed — dados de mentira + acesso automatizado

No terminal do container **web de staging** (Coolify → aplicação → Terminal):

```bash
NODE_ENV=development \
STAGING_ADMIN_EMAIL=staff@staging.local \
STAGING_ADMIN_PASSWORD='senha-de-mentira-com-12+' \
npm run db:seed:staging
```

O que ele cria (e roda quantas vezes quiser — é idempotente, não duplica nada):

- catálogo completo (produto, planos, preços, packs de revenda) e as contas de demonstração do seed de dev (`cliente@plfcore.dev` / `plfcore123`, afiliado e revenda);
- o staff **SUPERADMIN** do e-mail que você passou, com e-mail já verificado e **segredo TOTP conhecido**;
- um pedido **PAID** e uma licença **ACTIVE** para o cliente de mentira.

Dois portões impedem esse script de tocar em produção: ele aborta se `DATABASE_URL`/`APP_URL` apontarem para um host de produção (`core.proleague.com.br` e afins — `staging.core...` passa, é host exato) e aborta com `NODE_ENV=production`. O primeiro não tem interruptor; o segundo é o `NODE_ENV=development` do comando acima, que existe porque a imagem de staging é a build de produção.

### Pegar o segredo TOTP

A saída do seed termina assim:

```
STAGING PRONTO — tudo aqui é dado de mentira.

  Painel:            https://staging.core.proleague.com.br/admin
  Staff SUPERADMIN:  staff@staging.local (senha: a de STAGING_ADMIN_PASSWORD)
  TOTP secret (hex): 5c19de3a50fece9bba84c2aff1435d0569823b1d
  Código agora:      585025  (vale <= 30s; ...)

  Cliente:           cliente@plfcore.dev / plfcore123
  Licença ACTIVE:    PLF-XXXX-XXXX-XXXX-XXXX
```

Copie a linha **`TOTP secret (hex)`** e entregue a quem automatiza, junto com e-mail e senha. Com o segredo em mãos, o código de 6 dígitos sai do mesmo algoritmo do site — `totpCode(secret)` de `src/lib/crypto.ts` (TOTP RFC 6238, SHA-1, 30s, 6 dígitos). Rodar o seed de novo repete o MESMO segredo; ele só muda se você trocar a `ENCRYPTION_KEY`.

Quer o 2FA no seu celular também? Entre com a sua própria conta e use `/admin/config` — lá o painel mostra QR Code e base32.

## 9. Por que a 2FA continua ligada em staging

Porque o único jeito de garantir que ela está ligada em produção é não existir código capaz de desligá-la: o acesso automatizado entra pelo portão normal, com um segredo TOTP que é público de propósito neste ambiente.

## 10. Ordem de fogo

1. MySQL de staging no ar.
2. Aplicação de staging criada, variáveis do passo 5 preenchidas (segredos NOVOS).
3. Domínio + DNS + certificado.
4. Deploy, `/api/health` e `/api/ready` verdes.
5. Seed do passo 8; guarde o segredo TOTP.
6. Entrar em `/admin`, passar pela 2FA, conferir pedido pago e licença ativa.
7. Confirmar no painel do Coolify que produção **não** foi tocada: aplicação e banco de staging são recursos separados, com nome diferente.
