# CONTRATO DE IMPLEMENTAÇÃO — RESYNC WEB

Plataforma de venda/licenciamento do software Resync (app desktop de diagnóstico/otimização Windows). Leia este arquivo INTEIRO antes de escrever qualquer código.

## Stack

- Next.js 16 (App Router, `src/app`), TypeScript estrito, Tailwind 4 (tokens em `src/app/globals.css`).
- Prisma 7 + MySQL. **Importe SEMPRE de `@/generated/prisma/client`** (nunca `@prisma/client`). Client em `@/lib/db` (`db`).
- ATENÇÃO Next 16: `cookies()`, `headers()` e `params` são **async** (`await`). Server Components por padrão; `'use client'` só quando precisa de interatividade.
- Datas no banco em UTC; exibição com `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- Dinheiro SEMPRE em centavos inteiros; formatar com `formatCents` de `@/lib/money`.

## Libs prontas (NÃO reimplementar, NÃO editar)

- `@/lib/session` — `currentUser()`, `createSession(userId)`, `destroySession()`, `revokeAllSessions(userId)`.
- `@/lib/auth` — `requireUser()`, `requireStaff(min)` (`'SUPPORT' | 'ADMIN' | 'SUPERADMIN'`), `hasStaffRole`.
- `@/lib/actions/auth` — server actions de cadastro/login/logout/reset prontas.
- `@/lib/crypto` — hash de senha, tokens, `encrypt/decrypt`, chave de licença, TOTP (`generateTotpSecret`, `verifyTotp`, `totpCode`).
- `@/lib/licensing` — `issueOrExtendLicense(tx, ...)`, `activateLicense(key, hwid, ...)`, `findLicenseByKey(key)`, `licenseStatusCheck(license)`.
- `@/lib/checkout` — `quoteOrder(planSlug, couponCode?, userId?)`, `createOrder(userId, planSlug, couponCode?)`.
- `@/lib/payments` — `getPaymentProvider()` → `provider.createCheckout(order, user, 'PIX'|'CARD'|'BOLETO')` retorna `{ payment, redirectUrl?, pix?, sandbox }`.
- `@/lib/fulfillment` — `processPaymentEvent(providerName, event)` (chamado só pelo webhook).
- `@/lib/affiliates` — `registerClick`, `attachAttribution`, `resolveAffiliateForOrder`, `AFFILIATE_COOKIE`.
- `@/lib/resellers` — `addCredits`, `issueResellerLicense`, `resellerCostCents`.
- `@/lib/audit` — `audit({...}, tx?)`. TODA ação sensível gera auditoria (com `reason` quando admin).
- `@/lib/jobs` — `enqueue(type, payload, opts?, tx?)`; tipos em `JobType`.
- `@/lib/settings` — `getSetting`, `setSetting`, `getSettingNumber`.
- `@/lib/ratelimit` — `rateLimit(key, limit, windowMs)`.
- `@/lib/discord` — `sendDm`, `addGuildRole`, `removeGuildRole`, `deliverPurchaseDm`.
- `@/lib/email` — `sendMail(to, subject, text, html?)` (sem SMTP → vira log, não quebra).
- `@/lib/env` — `env.*`, `discordConfigured()`, `smtpConfigured()`.
- `@/lib/brand` — `BRAND.name` ('RESYNC'). Nunca hardcode o nome.

## Design (REGRA ZERO — inegociável, portado do app)

- `border-radius` global é 0. NUNCA cantos arredondados (nada de `rounded-*`). Círculo literal = classe `circle`.
- Paleta SÓ pelos tokens: `void/carbon/steel` (fundos), `signal` (ação/CTA), `blood`, `rust`, `heat` (warning), `ink-1..4` (texto), `line/edge` (bordas). Em Tailwind: `bg-void`, `text-ink-1`, `text-signal`, `border-line` etc. PROIBIDO roxo/azul/verde/teal/amarelo/gradiente colorido/slate.
- Componentes prontos em `@/components/ui`: `Chamfer` (superfície chanfrada), `Kicker`, `SegProgress` (barra segmentada — NUNCA barra lisa nem spinner), `DemoSeal`, `StatusTag`, `RuleFade`, `Field`. Header/footer públicos: `@/components/site-header`, `@/components/site-footer`.
- Botões: classes `btn btn--primary|--ghost|--danger|--sm chamfer` (em `<button>` ou `<Link>`).
- Títulos: classe `type-display`. Números/dados: `type-mono`. Labels: `type-kicker`. Inputs: classe `field`.
- Sucesso = branco + check textual; erro = `signal`; warning = `heat`. Estado NUNCA só por cor.
- Sem emoji na UI. Sem glassmorphism/backdrop-blur. `hazard` só em zona destrutiva.
- Mobile-first: tudo responsivo (`max-w-6xl mx-auto px-4` como container padrão), navegável por teclado, labels e mensagens de erro claras.

## Copy e honestidade (inegociável)

- pt-BR com acentuação perfeita. Voz de máquina: curta, técnica, direta, títulos/botões em MAIÚSCULAS. Sem "desbloqueie/eleve/potencialize", sem medo, sem urgência falsa, sem contador falso.
- Mensagem central: "A gente não finge que seu PC tem um problema. A gente mostra."
- NUNCA inventar número, depoimento, benchmark, contagem de clientes ou avaliação. Sem prova social real → não existe a seção.
- Dado ilustrativo → `<DemoSeal />` visível ao lado.
- Erro diz o que houve E o que fazer.
- O site NUNCA alega ter analisado o PC do visitante.
- Funções do app que o site pode citar (só estas): diagnóstico com dados reais (CPU/GPU/RAM/discos/temperaturas via sensores reais), inventário de hardware, limpeza segura de arquivos temporários com whitelist, otimizações do Windows explicadas e reversíveis, registro de toda ação no "LOG", prova real antes/depois, modo demonstração claramente selado. NADA além disso.

## Regras de execução

- Você é um dos vários agentes em paralelo. **Só crie/edite arquivos dentro dos caminhos designados no seu prompt.** NÃO toque: `prisma/schema.prisma`, `package.json`, `src/lib/*` (exceto se seu prompt designar), `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui.tsx`, `site-header.tsx`, `site-footer.tsx`, arquivos de outros agentes.
- Precisa de dependência nova? NÃO instale — registre na resposta final.
- NÃO rode `prisma migrate`, `npm install`, `next build`, nem inicie servidor.
- Ao terminar: rode `npx tsc --noEmit` em `d:\Github\resync\web` e corrija erros DOS SEUS arquivos (ignore erros de arquivos alheios; reporte-os).
- Autorização SEMPRE no servidor (guards de `@/lib/auth` no topo de page/action/route). Isolamento: cliente só vê o que é dele.
- Formulários: server actions com `useActionState` quando precisar de erro inline, ou action direta em `<form action=...>`.
- Schema Prisma completo em `prisma/schema.prisma` — leia para conhecer os modelos.
