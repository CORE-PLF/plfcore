# DEPLOY NO COOLIFY — RESYNC WEB

Passo a passo para colocar a plataforma no ar numa VPS com Coolify (proxy Traefik/Caddy funcionando e repositório Git conectado). As variáveis estão detalhadas em `ENV-PRODUCTION.md`; a verificação final antes de vender, em `GO-LIVE-CHECKLIST.md`.

Arquitetura: **uma imagem Docker, dois serviços** — `web` (Next.js, `npm start`) e `worker` (fila, `npm run worker`) — mais um MySQL 8 gerenciado pelo Coolify. Sem Redis (ver passo 2).

## 1. MySQL 8

1. No Coolify: **+ New → Database → MySQL** (versão 8).
2. Senha forte e nome do banco (ex.: `resync`). O Coolify cria o volume persistente sozinho — confirme que ele existe (Database → Storage).
3. Anote a **URL interna** (`mysql://usuario:senha@nome-do-servico:3306/resync`). Use SEMPRE o hostname interno do serviço — app e banco conversam pela rede do Coolify, não por `localhost`.
4. Agende **backups** (Database → Backups): diário no mínimo, retenção definida, destino externo (S3) de preferência.
5. Autenticação: o MySQL 8 usa `caching_sha2_password` por padrão. O app já trata isso — o driver conecta com `allowPublicKeyRetrieval` (ver `web/src/lib/db.ts`). Não precisa mudar o plugin de autenticação nem criar usuário com `mysql_native_password`.

## 2. Redis — NÃO usar na v1

Redis é **opcional e NÃO é usado na v1**. Rate limit e fila de jobs persistem no MySQL (tabelas `RateLimit`/`Job`). `REDIS_URL` existe no `.env` apenas como reserva futura — deixe vazia e **não crie um serviço Redis**. Criar agora seria dependência falsa: nada no código conecta nele.

## 3. Aplicação web

1. **+ New → Application → repositório Git** deste projeto, base directory: a raiz do repositório.
2. Build Pack: **Dockerfile** (`Dockerfile` — instala, gera o Prisma Client, builda o Next e roda como usuário sem privilégio).
3. Porta exposta: `3000`.
4. Healthcheck: `GET /api/health` (liveness — o processo responde). Readiness: `GET /api/ready` (confere que o banco está alcançável; retorna 503 se não). O Dockerfile já traz um `HEALTHCHECK` interno no `/api/health`.
5. Variáveis de ambiente: todas de `ENV-PRODUCTION.md`. Em especial `DATABASE_URL` (URL interna do passo 1) e `APP_URL` (o domínio real do passo 4 — idêntico, com `https://`).
6. Domínio + HTTPS: aponte o DNS (registro A/AAAA) para a VPS e configure o domínio na aplicação. O proxy do Coolify emite e renova o certificado Let's Encrypt.

## 4. Release command — migrations

Em **Pre-deployment command** da aplicação web:

```bash
npx prisma migrate deploy
```

Roda a cada deploy, antes do app subir. **Uma instância só, NUNCA em réplicas simultâneas** — é comando de release, não de start. Se um dia escalar o web para várias réplicas, garanta que a migration continua rodando uma vez só. E **não** configure esse comando no worker (passo 5) — migration é responsabilidade exclusiva do serviço web.

## 5. Worker — segundo serviço, mesma imagem

O worker consome a fila (e-mails, DMs do Discord, expiração de licença, aprovação de comissão). Sem ele o site funciona, mas nada assíncrono é entregue.

1. **+ New → Application**, MESMO repositório, MESMO Dockerfile.
2. **Custom start command**: `npm run worker`.
3. MESMAS variáveis de ambiente do web (`DATABASE_URL` apontando para o MESMO banco).
4. Sem domínio, sem porta pública, sem healthcheck HTTP — é processo de fundo.
5. Sem release command (migration só no web).

## 6. Seed de desenvolvimento — NUNCA em produção

`npm run db:seed` cria contas de demonstração (`@resync.dev`, senha conhecida). O script **se recusa a rodar com `NODE_ENV=production`**, mas não conte só com isso: simplesmente nunca o execute fora da máquina de dev. Banco de produção com conta `@resync.dev` = incidente.

## 7. Primeiro admin

No terminal do container **web** (Coolify → aplicação → Terminal):

```bash
ADMIN_EMAIL=voce@seudominio.com ADMIN_PASSWORD='senha-forte-unica' npm run admin:create
```

O script (`web/scripts/create-admin.ts`) lê `ADMIN_EMAIL` e `ADMIN_PASSWORD` do ambiente — não é interativo. Exige senha com pelo menos 12 caracteres; cria o usuário como `SUPERADMIN` com e-mail já verificado, ou promove (e redefine a senha de) uma conta existente com esse e-mail.

Depois: entre em `/admin` e **ative o 2FA (TOTP) imediatamente**.

## 8. Mercado Pago

1. Em https://www.mercadopago.com.br/developers, crie a aplicação e copie o **Access Token de produção** para `MERCADOPAGO_ACCESS_TOKEN`.
2. Configure `PAYMENT_PROVIDER=mercadopago` (`sandbox` é só para teste sem dinheiro real).
3. Em **Webhooks**, cadastre: `https://SEU-DOMINIO/api/webhooks/payments?provider=mercadopago` (eventos de pagamento). A confirmação de pagamento acontece EXCLUSIVAMENTE por esse webhook — o redirect do navegador nunca marca pedido como pago.
4. Copie a **assinatura secreta** do webhook (painel do MP) para `PAYMENT_WEBHOOK_SECRET`. Webhook com assinatura inválida é registrado e rejeitado.
5. `MERCADOPAGO_COLLECTOR_ID` (opcional): ID da conta recebedora. Se definido, o webhook confere que o pagamento pertence a essa conta — proteção extra contra evento de conta errada.

## 9. Discord (opcional, mas recomendado)

Variáveis vazias = login Discord desativado, site segue funcionando. Para ativar, em https://discord.com/developers/applications:

1. Crie a aplicação. Copie **Client ID**, **Client Secret** e **Public Key** ("General Information") para as variáveis.
2. Em **OAuth2 → Redirects**, adicione EXATAMENTE: `https://SEU-DOMINIO/api/auth/discord/callback`.
3. Em **Bot**, crie o bot, copie o token (`DISCORD_BOT_TOKEN`) e convide-o para o seu servidor com permissão de gerenciar cargos. Copie o ID do servidor para `DISCORD_GUILD_ID`.
4. Em **General Information → Interactions Endpoint URL**: `https://SEU-DOMINIO/api/discord/interactions`. O Discord valida na hora — o app precisa estar no ar com `DISCORD_PUBLIC_KEY` configurada.
5. Registre o slash command no terminal do container web:

   ```bash
   npx tsx scripts/register-discord-commands.ts
   ```

## 10. Backup e restauração

Além do backup agendado do passo 1, manual pelo terminal do container do MySQL:

```bash
mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" resync > /tmp/resync-$(date +%F).sql
```

Restauração:

```bash
mysql -u root -p"$MYSQL_ROOT_PASSWORD" resync < /tmp/resync-2026-01-01.sql
```

Guarde junto do dump a `ENCRYPTION_KEY` e o `AUTH_SECRET` da época — sem a `ENCRYPTION_KEY` original, as chaves de licença criptografadas do dump são ilegíveis.

## 11. Publicar o instalador

O `ResyncSetup.exe` vem do build do app desktop (Tauri, fora deste deploy). O instalador **nunca** fica em URL pública: ele mora em volume persistente do container web e só é entregue por rota autenticada, para quem tem licença.

1. Crie o volume uma vez, em Application (`resync-web`) > Storages > Add: **Volume Mount**, destino `/data/installers`. Redeploy para montar.
2. Calcule o SHA-256 real do arquivo (PowerShell):

   ```powershell
   Get-FileHash .\ResyncSetup.exe -Algorithm SHA256
   ```

3. Em `/admin/versoes`, envie o `.exe` pelo campo de upload (até 200 MB, grava direto no volume) **ou** coloque o arquivo em `/data/installers` por fora (terminal do container, `scp`) e informe só o nome.
4. Preencha versão + nome do arquivo + checksum e salve. O servidor recalcula o SHA-256 do arquivo no volume e recusa a versão se divergir do informado.
5. PUBLICAR libera a versão. A entrega passa por `/download/arquivo`, que reconfere sessão + licença; o aplicativo pega link assinado de 10 minutos em `/api/v1/app/download`.

Variável opcional: `INSTALLERS_DIR` (padrão `/data/installers`) — só mexa se o volume for montado em outro caminho.

## 12. Ordem de fogo

1. MySQL no ar com backup agendado.
2. Web no ar com domínio + HTTPS, `/api/health` e `/api/ready` respondendo.
3. Worker no ar.
4. Superadmin criado + 2FA.
5. Compra de ponta a ponta em `PAYMENT_PROVIDER=sandbox` no domínio real.
6. Virar `mercadopago` + redeploy.
7. `GO-LIVE-CHECKLIST.md` inteiro antes de divulgar.
