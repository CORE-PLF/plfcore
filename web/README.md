# RESYNC WEB

Plataforma de venda e licenciamento do RESYNC — app desktop Windows de diagnóstico e otimização para gamers. Site público, checkout (PIX/cartão/boleto via Mercado Pago), painel do cliente com licenças e downloads, programa de afiliados, revenda com créditos, suporte por tickets, integração Discord (OAuth, DM de entrega, slash command) e painel administrativo.

Princípio do produto: **a gente não finge que seu PC tem um problema — a gente mostra.** O site nunca inventa número, nunca simula urgência e nunca alega ter analisado a máquina do visitante.

## Stack

- **Next.js 16** (App Router, Server Components, server actions) + TypeScript estrito
- **Tailwind 4** (tokens do design system em `src/app/globals.css` — border-radius 0, chanfros, paleta própria)
- **Prisma 7** + **MySQL** (adapter `@prisma/adapter-mariadb`; client gerado em `src/generated/prisma`)
- Sessões próprias (cookie httpOnly + tabela `Session`), fila de jobs em banco processada por um **worker** separado (`src/worker`)
- Testes com **Vitest**

## Requisitos

- Node.js 24+
- Docker (para o MySQL local) — ou um MySQL 8 seu
- npm

## Rodar local

1. Suba o MySQL de desenvolvimento:

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

2. Crie o `.env` a partir do exemplo e ajuste:

   ```bash
   cp .env.example .env
   ```

   Para o compose acima, use:

   ```env
   DATABASE_URL=mysql://root:resync_dev@localhost:3307/resync
   APP_URL=http://localhost:3000
   NODE_ENV=development
   AUTH_SECRET=qualquer-coisa-com-16-ou-mais-chars
   ENCRYPTION_KEY=qualquer-coisa-com-32-ou-mais-caracteres
   PAYMENT_PROVIDER=sandbox
   PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
   ```

   Discord/SMTP/Mercado Pago podem ficar vazios em dev — e-mail vira log no console e Discord fica desativado.

3. Instale, migre e popule:

   ```bash
   npm install
   npx prisma migrate dev
   npm run db:seed
   ```

4. Suba o app e o worker (dois terminais):

   ```bash
   npm run dev      # site em http://localhost:3000
   npm run worker   # processa a fila (e-mails, DMs do Discord, expirações)
   ```

   Sem o worker o site funciona, mas nada assíncrono é entregue (e-mail, DM, notificação).

## Scripts npm

| Script | O que faz |
| --- | --- |
| `npm run dev` | Dev server em http://localhost:3000 |
| `npm run build` | Build de produção do Next |
| `npm start` | Serve o build de produção |
| `npm run worker` | Processa a fila de jobs (rodar junto do site) |
| `npm run db:migrate` | `prisma migrate deploy` (migrations em produção) |
| `npm run db:seed` | Contas de demonstração — SÓ dev; recusa `NODE_ENV=production` |
| `npm run admin:create` | Cria/promove superadmin via `ADMIN_EMAIL` + `ADMIN_PASSWORD` |
| `npm test` | Vitest (contra o MySQL de dev real) |

### Contas de demonstração (SÓ desenvolvimento)

O seed cria contas com senha `resync123`. **Elas existem apenas para desenvolvimento local — o seed se recusa a rodar com `NODE_ENV=production` e NUNCA deve ser executado em produção.**

| E-mail | Papel |
| --- | --- |
| `admin@resync.dev` | Superadmin (painel `/admin`) |
| `cliente@resync.dev` | Cliente comum |
| `afiliado@resync.dev` | Afiliado aprovado |
| `revenda@resync.dev` | Revendedor aprovado |

## Testes

```bash
npm test
```

## Fluxo de compra em sandbox (passo a passo)

Com `PAYMENT_PROVIDER=sandbox` nenhum dinheiro real circula — o provedor é simulado dentro do próprio app:

1. Entre com `cliente@resync.dev` (ou crie uma conta).
2. Vá em **COMPRAR**, escolha um plano e conclua o checkout.
3. Na página do pedido aparece o botão de **simular pagamento** (só existe no sandbox, com selo visível de demonstração). Clique nele — ele dispara o mesmo webhook assinado que o provedor real dispararia.
4. O fulfillment processa o evento: pedido vira `PAID`, a licença é emitida e aparece no painel do cliente, com a chave visível e os jobs de entrega (e-mail/DM) na fila.
5. Confira a licença em **PAINEL → LICENÇAS**. Se o worker estiver rodando, o e-mail de entrega sai no log (sem SMTP configurado).

## Deploy

O passo a passo completo de produção (Coolify: MySQL, web, worker, migrations, Mercado Pago, instalador) está em **`../deploy/COOLIFY.md`**. Complementos:

- `../deploy/ENV-PRODUCTION.md` — todas as variáveis de ambiente, obrigatoriedade e como gerar cada segredo (modelo em `.env.example`)
- `../deploy/GO-LIVE-CHECKLIST.md` — verificação do fluxo comercial completo antes de vender
- `docs/CHECKLIST-PRODUCAO.md` — checklist de segredos, integrações e infra

Resumo da arquitetura de deploy: uma imagem Docker (o `Dockerfile` daqui) serve dois serviços — web (`npm start`, porta 3000) e worker (`npm run worker`) — com MySQL 8 do Coolify. Migrations rodam como release command (`npx prisma migrate deploy`), nunca em réplicas simultâneas. Redis NÃO é usado na v1.

## Credenciais externas pendentes

O que precisa existir fora do repositório antes de vender de verdade:

- [ ] Conta Mercado Pago com aplicação criada (access token de produção + secret do webhook)
- [ ] Aplicação + bot no Discord Developer Portal (client id/secret, bot token, public key, servidor)
- [ ] Provedor SMTP transacional (host, porta, usuário, senha, remetente com domínio verificado/SPF/DKIM)
- [ ] Domínio próprio com DNS apontado para o Coolify
- [ ] Storage público HTTPS (Cloudflare R2/S3) para hospedar o instalador

## Documentação

- `docs/ARQUITETURA.md` — visão geral, fluxo de compra, decisões
- `docs/BANCO.md` — modelo de dados e convenções
- `docs/CHECKLIST-PRODUCAO.md` — checklist antes de abrir as portas
- `../deploy/` — COOLIFY.md, ENV-PRODUCTION.md, GO-LIVE-CHECKLIST.md
