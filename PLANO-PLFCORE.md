# PLF CORE — plano de execução

Plano pra ser executado pelo Opus, trilha por trilha. Escrito em 2026-09-14 depois de mapear
`resync-app`, `resync-web` e a documentação da CentralCart.

## 0. O que entendi

PLF Core = cópia do RESYNC (app desktop Tauri de otimização de Windows pra gamers) rebatizada pra
PLF / Pro League, com:

1. **Redesign completo** seguindo o Figma "PLF / NEXT - UI" (preto + amarelo, cantos arredondados,
   cards, tipografia sans). Referências já baixadas em `figma/` e prints do app atual em `resync-prints/`.
2. **Venda e checkout pela CentralCart** (loja `loja.jogueone.com`), no lugar do checkout próprio com
   Mercado Pago. A CentralCart entrega a chave de licença; nosso backend só confirma via webhook e ativa.

### Fonte da cópia (importante)

| Repo | Papel | Copiar? |
|---|---|---|
| `d:\Github\resync-app` | App desktop **atual** (v1.9.0) | **SIM** → `plfcore/app` |
| `d:\Github\resync-web` | Site + backend de licença (Next.js 16 + Prisma + MySQL) | **SIM** → `plfcore/web` |
| `d:\Github\resync` | Snapshot antigo (v1.0.0) com site embutido | **NÃO** (é a pasta aberta no editor, mas está defasada) |

Hoje **não existe Stripe** em lugar nenhum; o provedor real é só Mercado Pago (+ um provedor `sandbox`).

### Premissas (assumidas, avisa se alguma estiver errada)

- `d:\Github\plfcore` vira **um repo git** com `app/` e `web/` dentro (hoje está vazio).
- Nome do produto: `PLF CORE`. Prefixo de chave: `PLF-XXXX-XXXX-XXXX-XXXX`. Identificador Tauri: `com.plfcore.app`.
- Site público do PLF Core = landing + download + admin. **Sem conta de cliente e sem painel** (a chave
  chega pela CentralCart: tela do pedido + e-mail + área do cliente deles). Instalador passa a ser
  download público (o app já é travado por licença; não há motivo pra proteger o .exe).
- Nada é migrado do RESYNC (licenças, usuários). Os repos `resync*` não são tocados.
- i18n em 5 idiomas, "prova real", honestidade de dados, gate nativo de licença: **tudo mantido**.

---

## 1. Trilhas e dependências

```
A  Fork + rebrand (mecânico)                      ── sem dependência
B  Design system PLF (tokens + primitivos)        ── depende de A
C  Redesign tela a tela do app                    ── depende de B
D  Backend: CentralCart no lugar do Mercado Pago  ── depende de A   (paralelo com B/C)
E  Site público (landing/download) no visual PLF  ── depende de B   (paralelo com C)
F  Configuração da loja CentralCart (manual)      ── sem dependência (paralelo com tudo; D precisa
                                                     dos IDs pra testar de verdade)
```

Paralelismo: `A` primeiro (rápido). Depois `B`, `D` e `F` ao mesmo tempo (subagents distintos, pastas
distintas: `app/src/styles` vs `web/`). `C` e `E` só depois de `B`. `C` pode ser dividida por módulo
(um subagent por tela, nunca dois no mesmo arquivo).

---

## 2. Trilha A — fork e rebrand

1. Copiar `resync-app` → `plfcore/app` e `resync-web` → `plfcore/web`, excluindo `node_modules`,
   `dist`, `.next`, `src-tauri/target`, `artifacts`, `.git`, `.playwright-mcp`, `*.exe`, `*.mp4`, `*.png`
   soltos na raiz (bug-checks).
2. `git init` em `plfcore`; `.gitignore` cobrindo `.env*`, `node_modules`, `dist`, `.next`, `target`,
   `artifacts`, `*.pem`, `*.pfx`. **Antes** do primeiro commit.
3. Rebrand (grep `-i resync` nos dois projetos, trocar caso a caso, sem regex cego):
   - `app/src/brand.ts` → `name: 'PLF CORE'`, `version: '1.0.0'`, `revision: 'REV A'`.
   - `app/src-tauri/tauri.conf.json` → `productName`, `identifier: com.plfcore.app`, título da janela.
   - `app/src-tauri/src/license.rs` → serviço do keyring `com.plfcore.app`, sal do HWID
     `plfcore:v1|`, env `PLFCORE_API_BASE_URL`, `site_base()` pro domínio novo.
   - `app/src-tauri/src/commands.rs` → `open_site`: `comprar` → URL da loja CentralCart (env),
     `download` → `/download`. Remover `painel` (não existe mais).
   - `web/src/lib/crypto.ts` → `generateLicenseKey` com prefixo `PLF-`.
   - `web/src/lib/brand.ts`, `package.json` (nome), `docs/DESKTOP-RELEASE.md`, `scripts/build-desktop-release.ps1`.
   - Ícones/logo: substituir por `plfcore/assets/` (extraídos do Figma — ver §5).
4. Critério de pronto: `npm run build` verde em `app/` e em `web/`; `cargo test` verde em `app/src-tauri`;
   `grep -ri resync` só sobra em changelog/histórico deliberado (idealmente zero).

---

## 3. Trilha D — CentralCart no lugar do Mercado Pago

### 3.1 O que a CentralCart oferece (lido da doc, 2026-09-14)

- **Loja hospedada** com checkout próprio e vários gateways (PIX, cartão, Mercado Pago, Stripe, PayPal…).
  Não precisamos de gateway nenhum no nosso lado.
- **Produto digital com "Linhas"/license keys**: estoque FIFO de chaves; cada compra aprovada consome
  uma e entrega ao comprador na tela do pedido e por e-mail. Quando o estoque zera, o produto fica
  "sem estoque" sozinho.
- **API privada** (`https://api.centralcart.io/v1`, header `Authorization: Bearer cc_sk_...`, chave
  gerada em Configurações → Integrações, com escopos):
  - `POST /app/package/{package-id}/license-keys` `{ license_keys: [...] }` — até 5.000 por chamada.
  - `GET  /app/package/{package-id}/license-keys` — lista o estoque (sem status de consumo).
  - `GET  /app/order/{order_id}` — pedido completo, inclui `deliveries[]` (`type: LICENSE_KEY`, `value`),
    `client_email`, `status`, `paid_at`, `packages[]`.
  - `GET  /app/package/{id}` — `inventory_amount` (pra alertar estoque baixo).
- **Webhooks** (Configurações → Integrações): eventos `ORDER_APPROVED`, `ORDER_REFUNDED`,
  `ORDER_CHARGEDBACK`, `ORDER_REJECTED`, `LICENSE_KEY_UPDATED`… Payload `{ id, event, date, data }` onde
  `data` = o mesmo objeto de `GET /app/order/{id}`. Assinatura HMAC-SHA256 de `"{timestamp}.{body}"`
  com o secret do webhook; headers `x-centralcart-signature` (hex) e `x-centralcart-timestamp`.
  Responder 2xx em até 10 s; reenviam em falha; deduplicar por `id`.
- **Storefront API** (pública, header `x-store-domain`): `POST /webstore/auth/otp` + `/verify` dão um
  `access_token` de 30 dias e `GET /webstore/account/order` lista os pedidos do comprador com
  `deliveries[]` (só em pedidos aprovados). Serve pra fase 2 (login por e-mail dentro do app).
- Não há sandbox documentado. Teste real = pedido de valor mínimo ou cupom de 100 %.

### 3.2 Arquitetura escolhida

**Chaves pré-geradas pelo nosso backend, estoque vive na CentralCart, webhook confirma a venda.**

```
[admin] gera lote → License{status: UNSOLD, plan} (hash + ciphertext, como hoje)
        └─► POST /app/package/{id}/license-keys  (texto puro vai pro estoque da CC)

[cliente] compra na loja CC → paga (PIX/cartão/…) → CC entrega a chave (tela + e-mail)

[CC] ORDER_APPROVED ──► POST /api/webhooks/centralcart
        valida HMAC → dedup por event.id → p/ cada deliveries[type=LICENSE_KEY]:
        License por keyHash → status SOLD, ccOrderId, buyerEmail, paidAt, plan por packageId

[app] LicenseGate igual ao de hoje: cola chave → /api/v1/licenses/activate → hwid → deviceToken
        UNSOLD  → 409 ERR_LICENSE_NOT_SOLD ("Pagamento ainda não confirmado. Aguarde alguns minutos.")
        SOLD    → ativa, liga o relógio, vincula o dispositivo (fluxo atual)

[CC] ORDER_REFUNDED / ORDER_CHARGEDBACK ──► suspende a licença (reusa applyRefundEffects)
```

Por que assim: (1) o app não muda nada no fluxo de ativação; (2) uma chave vazada do estoque da CC não
ativa nada enquanto o webhook não marcar `SOLD`; (3) a CC cuida de gateway, e-mail, área do cliente,
afiliados, cupons — tudo isso sai do nosso código.

Alternativas descartadas: (a) app validar direto na CC — não dá, a chave privada não pode ir no app e a
API de estoque não diz qual chave foi consumida por quem; (b) app logar na CC por e-mail e puxar a
chave sozinho — bom pra fase 2, mas ainda precisa do nosso backend pra hwid, então não tira nada.

### 3.3 O que sai do `web/`

- `src/lib/payments/*` (mercadopago, sandbox, types, index), `src/app/api/dev/sandbox`.
- `src/app/comprar/**`, `src/lib/actions/checkout.ts`, `src/lib/checkout.ts` (quote/cupom/createOrder),
  `src/lib/money.ts`, `src/lib/qr.ts`, `src/lib/refunds.ts`, `src/lib/affiliates.ts`, `src/lib/resellers.ts`.
- Prisma: `Order`, `Payment`, `PaymentEvent`, `Refund`, `Commission`, `Coupon`, afiliados, revendedores,
  créditos, `Price` (preço agora é da CC). `LegalAcceptance` sai (o aceite passa a ser termo da loja CC).
- Contas de cliente: `/painel/**`, login/cadastro de usuário, `verificar-email`, SMTP de cadastro,
  DM no Discord por compra. **Admin fica** (login + TOTP).
- Env: `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET`, `MERCADOPAGO_*`, `DISCORD_*` (a menos que o admin use).
- Download: `src/app/(publico)/download/arquivo/route.ts` deixa de exigir sessão/licença; mantém o
  registro em `Download` e o checksum.

### 3.4 O que fica

`src/lib/licensing.ts` (issue/activate/status/heartbeat), `src/lib/crypto.ts`, `src/app/api/v1/**`
(activate, validate, heartbeat, app/version, app/download, status), `src/lib/gates.ts`,
`src/lib/installer.ts`, `src/lib/audit.ts`, `src/lib/ratelimit.ts`, admin (`versoes`, `gates`,
licenças, log), modelos `Product`, `Plan`, `License`, `LicenseDevice`, `LicenseEvent`, `AppVersion`,
`Download`, `Setting`, `AdminUser`, `AuditLog`. Worker só se algo restante enfileirar.

### 3.5 O que entra

- `src/lib/centralcart.ts` — cliente: `addLicenseKeys(packageId, keys)`, `getOrder(id)`,
  `getPackage(id)`, `verifyWebhookSignature(rawBody, ts, sig)` (HMAC-SHA256 hex, `timingSafeEqual`,
  rejeitar timestamp com mais de 5 min). Base URL e chave via env; erros 403 de escopo viram mensagem
  clara no admin.
- `src/app/api/webhooks/centralcart/route.ts` — lê o corpo **cru** (assinatura é sobre o texto),
  valida, grava `CentralcartEvent{ id (único), event, orderId, receivedAt, processedAt, error }`,
  processa, responde 200. Assinatura inválida → 401 + registro. Erro interno → 500 (CC reenvia).
- `src/lib/fulfillment.ts` reescrito: `processCentralcartOrder(order)` — idempotente por
  `(orderId, deliveryId)`; `APPROVED` → marca `SOLD` cada chave entregue; `REFUNDED`/`CHARGEDBACK` →
  suspende. Se a chave da entrega não existe no banco → registra `UNKNOWN_KEY` no evento e avisa
  no admin (nunca cria licença do nada).
- Prisma: `License.status` ganha `UNSOLD`; novos campos `ccOrderId`, `ccPackageId`, `buyerEmail`,
  `soldAt`; `Plan.ccPackageId` (mapeia pacote da CC → plano/duração). Migration.
- `api/v1/licenses/activate`: `UNSOLD` → `409 ERR_LICENSE_NOT_SOLD`.
- Admin, duas telas novas: **Estoque CentralCart** (por plano: gerar N chaves + enviar; mostrar
  `inventory_amount` lido da CC; alerta abaixo de 20) e **Pedidos CentralCart** (eventos recebidos,
  erros, botão "Reconciliar pedido #" que chama `getOrder` e roda o mesmo processamento — cobre webhook
  perdido).
- Env novas: `CENTRALCART_API_KEY` (escopos: packages:read/write, license-keys:write, orders:read),
  `CENTRALCART_WEBHOOK_SECRET`, `CENTRALCART_STORE_URL` (link do botão COMPRAR no app e no site).
- App: `LicenseGate` mapeia `ERR_LICENSE_NOT_SOLD` pra copy própria nos 5 idiomas. Botão `COMPRAR`
  abre a loja CC.

### 3.6 Verificação (define antes de codar)

- Vitest: (1) `verifyWebhookSignature` aceita assinatura calculada com o secret e rejeita corpo
  alterado, timestamp velho e header ausente; (2) `processCentralcartOrder` com payload de exemplo da
  doc marca `SOLD` uma vez e ignora reenvio do mesmo `event.id`; (3) refund suspende; (4) chave
  desconhecida não cria licença; (5) `activate` recusa `UNSOLD`.
- Script `scripts/cc-simulate-webhook.ts`: assina um payload local com o secret e dispara no endpoint
  em dev (substitui o antigo `/api/dev/sandbox`).
- Ponta a ponta real (trilha F): produto de teste na loja com cupom 100 % → comprar → webhook chega
  → licença `SOLD` → colar no app → ativa. Registrar que foi manual.

---

## 4. Trilha F — configuração na CentralCart (manual, feita por você)

1. Criar **produto digital** "PLF Core" (um pacote por plano: mensal/anual/vitalício conforme
   `Plan`). Anotar os `package_id`.
2. Em cada pacote, aba **Linhas**: deixar vazio — o admin do backend vai popular via API.
3. Configurações → Integrações → **gerar chave de API** com os escopos do §3.5. Guardar em env, nunca
   no repo.
4. Configurações → Integrações → **webhook** apontando pra `https://<dominio>/api/webhooks/centralcart`,
   eventos `ORDER_APPROVED`, `ORDER_REFUNDED`, `ORDER_CHARGEDBACK`. Guardar o secret em env.
5. Instruções pós-compra do produto: "Abra o PLF Core, cole a chave, clique ATIVAR. Download em
   https://<dominio>/download".
6. Cupom de 100 % só pra teste; apagar depois.

---

## 5. Trilhas B/C/E — redesign

### 5.1 O que o Figma mostra (referências em `figma/`, resumo em `figma/_layers.json`)

- **Paleta** (amostrada dos PNGs; confirmar com os prints do Discord que você vai mandar):
  - Fundo base `#101010`; superfícies `#181818` → `#202020` → `#282828`; bordas ~`#2B2B2B`.
  - Acento **amarelo `#F8E800`** (pode ser `#FAE500`/`#F5D90A` no original): CTA, tab ativa, badge
    "Equipado", paginação ativa, ícones de moeda. Texto **preto** sobre amarelo.
  - Texto `#F8F8F8` / cinzas. Vermelho só em "Lendário"/erro. Verde/azul/roxo aparecem **apenas** nos
    temas de card (raridades e variantes de tema) — não são cor de UI.
- **Forma**: cantos arredondados (~8 px em cards, pílulas 999 px em badges/botões), bordas 1 px sutis,
  sem chanfro. Ou seja: **a REGRA ZERO do RESYNC (border-radius 0, chanfros) cai.**
- **Tipografia**: sans neutra (Inter ou equivalente), pesos 500/600, caixa normal (não caps
  itálico). Números não são mono no Figma; manter mono **só** na telemetria/gauges (decisão nossa,
  dados continuam tabulares).
- **Componentes recorrentes**: header com logo à esquerda + tabs no centro + pílulas de saldo à
  direita; card com cabeçalho "tema" colorido; badges de estado (`Equipado` amarelo / `Não equipado`
  cinza / `Bloqueado` cinza); campo de busca com ícone; filtros em pílula (`Todos / Desbloqueados /
  Bloqueados`); botão fechar circular; dica "Use o scroll para baixo"; hexágono de nível; barra de
  progresso lisa amarela; gauge não existe (o do RESYNC pode ficar, recolorido).
- **Logo**: "PRO LEAGUE" (letras brancas/prata, o "O" é uma mira **vermelha**) — a marca é
  branco + vermelho; o **amarelo é a cor de UI**, não da marca. Recortes em `assets/`:
  `logo-pro-league-grande.png` (loadscreen), `logo-pro-league-header.png` (header pequeno),
  `logo-proleague-badge-vermelho.png` (selo vermelho/branco), `card-tema-bloqueado.png`,
  `loadscreen-creditos-texto.png`. Não há SVG (o Figma é view-only sem export); pra vetor, pedir o
  arquivo original pro designer ou vetorizar o PNG grande.
- `figma/` tem ~930 MB de PNG: **não commitar** (colocar `figma/` e `resync-prints/` no `.gitignore`
  do repo `plfcore`, ou guardar fora do repo).

### 5.2 Trilha B — tokens e primitivos (`app/src/styles/index.css` + `app/src/components/`)

- `@theme`: `void/carbon/steel` → `#101010/#181818/#202020`; `signal` → amarelo (CTA); `blood`/`rust`
  saem; `heat` → laranja de aviso mantém; `ink-1..4` mantém; `line/edge` → `#2B2B2B`/`#333`.
- `border-radius`: reset global sai; escala `--r-sm: 6px / --r-md: 10px / --r-pill: 999px`.
- Fontes: Inter (UI e display), JetBrains Mono (telemetria). Saira/Quantico saem.
- Remover `hazard`, `scanlines`, grain, chanfros `clip-path` e a técnica do `::before`. Sombra volta a
  ser `box-shadow` normal.
- Glow amarelo só em CTA hover e LED vivo.
- Primitivos: `Button` (primário amarelo/texto preto, secundário cinza, ghost), `Pill`, `Badge`,
  `Card`, `Tabs`, `SearchField`, `ProgressBar` (lisa amarela — a regra "sempre segmentada" cai),
  `CloseButton`, `LevelHex`.
- Atualizar `app/CLAUDE.md` (a seção "Regras do design system") pra refletir tudo isso — senão o
  próximo agente reverte.

### 5.3 Trilha C — telas (ordem)

Layout: o Figma é overlay in-game centralizado; o app é janela desktop. Decisão: **manter sidebar
esquerda + topbar**, mas com a linguagem PLF (logo no topo, itens como pílulas/linhas com ícone,
item ativo amarelo). Se você preferir header horizontal com tabs (como o Figma), avisa — muda o shell.

1. Shell: `Sidebar`, `Topbar`, `BottomBar`, `Ignition` (boot com logo PLF), `FirstRun`.
2. `cockpit` (gauges recoloridos, cards de telemetria).
3. `fpsboost` (CTA amarelo dominante).
4. `license` (`LicenseGate`: card central, campo da chave, botões ATIVAR / COMPRAR).
5. `cleanup`, `xray`, `memory`, `windows`, `games`, `tweaks`, `runtimes`, `startup`, `latency`,
   `bottleneck`, `settings`, `log`, `matchoverlay`, `provareal`.

Cada tela: um subagent, escopo fechado (só o módulo + seu `i18n.ts`). Verificação: `npm run build`
verde + print no navegador (`npm run dev`, 1920×1080) comparado com a referência do Figma.

### 5.4 Trilha E — site (`web/`)

Landing (hero + o que faz + preço com botão que leva à loja CC + download), página `/download`,
admin. Mesmos tokens em `web/src/app/globals.css`. Sem `/planos` próprio com checkout: o botão
COMPRAR vai direto pra `CENTRALCART_STORE_URL`.

### 5.5 Material pro Claude Design (o que colar)

- `resync-prints/resync-01-boot.png` … `resync-05-fivem.png` (como está hoje).
- `figma/20-gerenciador-de-temas/*` (prioridade: é o visual que você quer), `figma/10-hud/*`,
  `figma/13-loadscreen/*`, `figma/24-lobby/*`, `figma/22-configuracoes/*`, `figma/01-sistema-de-caixas/1095-2-mainFrame.png`.
- `assets/logo-*.png`.
- Pedido: "Redesenhar estas 4 telas do app (cockpit, fps booster, limpeza, ativação) na linguagem
  visual destas referências: preto #101010, amarelo #F8E800, cards arredondados, Inter. Manter a
  estrutura de sidebar. Entregar tokens + 4 telas 1920×1080."

---

## 6. Ordem de execução (checklist pro Opus)

- [ ] A. Fork + rebrand → builds verdes → `git commit -m "chore: fork do resync como plfcore"`.
- [ ] Em paralelo: B (tokens), D (backend CC), F (você, na loja).
- [ ] D pronto → testes vitest verdes → script de simulação → commit.
- [ ] B pronto → `app/CLAUDE.md` atualizado → commit.
- [ ] C tela a tela (subagents por módulo) → print de cada tela → commit por tela.
- [ ] E site → commit.
- [ ] Ponta a ponta real com a loja (F + D + C.4): compra teste → webhook → chave SOLD → ativa no app.
- [ ] Build do instalador (`scripts/build-desktop-release.ps1`, `PLFCORE_API_BASE_URL`) → `.exe` + `.sha256`.

## 7. Fica pra depois (não entra agora)

- Login por e-mail dentro do app puxando a chave da CC (storefront OTP) — tira o "colar chave".
- Cron de reconciliação automática (hoje: botão no admin).
- "Temas" do app (variantes de cor por card, como no Figma) — só depois do redesign base.
- Renovação/extensão de licença existente via nova compra na CC (hoje: cada compra = chave nova;
  o app já orienta "nova compra" quando a chave expira).

## 8. Perguntas que mudam o plano (responde quando puder; senão sigo com o default)

1. Contas de cliente + painel no site: **remover** (default) ou manter?
2. Shell do app: **sidebar mantida** (default) ou header horizontal com tabs como no Figma?
3. Planos: quais (mensal / anual / vitalício) e um pacote na CC pra cada?
4. Domínio do PLF Core (pra `APP_URL`, `site_base()` e o webhook).
