# VARIÁVEIS DE AMBIENTE — PRODUÇÃO

Lista completa, espelho de `web/src/lib/env.ts` (a validação roda no boot — variável obrigatória faltando derruba o processo com mensagem clara). Modelo com placeholders em `web/.env.example`. **Nenhum valor real de produção entra em arquivo do repositório** — só no painel do Coolify.

## Obrigatórias

| Variável | Para que serve | Como gerar / valor |
| --- | --- | --- |
| `DATABASE_URL` | Conexão MySQL (Prisma + adapter MariaDB) | URL interna do serviço MySQL do Coolify: `mysql://usuario:senha@nome-do-servico:3306/resync` |
| `AUTH_SECRET` | Assina as sessões (cookie httpOnly). Mínimo 16 chars; use 32+ | `openssl rand -base64 32`. Trocar invalida todas as sessões ativas |
| `ENCRYPTION_KEY` | AES-GCM das chaves de licença no banco. Mínimo 32 chars | `openssl rand -base64 24` (gera exatamente 32 chars). **Backup fora do servidor, obrigatório** — perder ou trocar depois de emitir licenças torna as chaves antigas ilegíveis para sempre |
| `PAYMENT_WEBHOOK_SECRET` | Valida a assinatura dos webhooks de pagamento | Em produção: a "assinatura secreta" do webhook no painel do Mercado Pago. Em sandbox: qualquer valor forte |

## Com default (revisar em produção)

| Variável | Default | Para que serve |
| --- | --- | --- |
| `APP_URL` | `http://localhost:3000` | URL pública do site. Em produção: o domínio real com `https://`, idêntico ao configurado no Coolify (links absolutos, OAuth, webhooks) |
| `NODE_ENV` | `development` | `production` em produção (o Dockerfile já define no runner) |
| `PAYMENT_PROVIDER` | `sandbox` | `sandbox` = provedor simulado, sem dinheiro real. `mercadopago` = produção |

`PORT` (porta interna, `3000`) não passa pelo `env.ts` — é lida pelo `next start` e já vem definida no Dockerfile. Só mude se mudar a porta exposta junto.

## Mercado Pago (obrigatórias quando `PAYMENT_PROVIDER=mercadopago`)

| Variável | Para que serve |
| --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token de **produção** da aplicação no Mercado Pago (não o de teste) |
| `MERCADOPAGO_COLLECTOR_ID` | OPCIONAL. Se definida, o webhook confere que o pagamento pertence a esta conta recebedora |

## Reservadas / fallback

| Variável | Para que serve |
| --- | --- |
| `REDIS_URL` | RESERVADA — não usada na v1. Rate limit e fila persistem no MySQL. Deixe vazia; não crie serviço Redis |
| `INSTALLERS_DIR` | OPCIONAL. Diretório do volume persistente onde o instalador fica gravado. Padrão `/data/installers` — só defina se o Storage do Coolify for montado em outro caminho |

## Discord (opcionais — vazias = login Discord desativado, site segue funcionando)

| Variável | Para que serve |
| --- | --- |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth2 da aplicação Discord (login e vínculo de conta) |
| `DISCORD_BOT_TOKEN` | Bot que entrega DM de compra e gerencia cargo no servidor |
| `DISCORD_GUILD_ID` | ID do servidor Discord onde o bot atua |
| `DISCORD_PUBLIC_KEY` | Verifica a assinatura das interactions HTTP (aba "General Information") |

## SMTP (opcionais — vazias = e-mail vira log no console, boot não quebra)

Nenhum fluxo essencial depende de e-mail: a licença aparece no painel do cliente na hora, o e-mail de entrega é cortesia. Configure antes de vender mesmo assim — cliente espera receber.

| Variável | Default | Para que serve |
| --- | --- | --- |
| `SMTP_HOST` | vazio | Host do provedor SMTP transacional |
| `SMTP_PORT` | `587` | Porta SMTP |
| `SMTP_USER` / `SMTP_PASSWORD` | vazio | Credenciais |
| `SMTP_FROM` | `Resync <no-reply@localhost>` | Remetente — use domínio próprio com SPF/DKIM configurados |
