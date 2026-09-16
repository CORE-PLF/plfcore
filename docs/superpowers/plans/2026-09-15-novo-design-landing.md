# Novo design da landing (Redesign A2 — Cockpit Quadrado) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar no site (`web/`) o design da pasta `NOVO DESIGN/`, variante **Redesign-A2-Cockpit-Quadrado**, na landing, header e footer, mantendo dados de plano vindos do banco e a regra de honestidade (nada simulado sem selo).

**Architecture:** Next.js 16 App Router com Server Components. A landing continua sendo um Server Component (`src/app/page.tsx`); só o cockpit animado vira uma ilha client (`src/components/cockpit-demo.tsx`). Tokens de cor/raio mudam globalmente em `globals.css` (o header e o footer são compartilhados e precisam bater com o resto). Reveal-on-scroll é CSS puro (`animation-timeline: view()`), sem JS.

**Tech Stack:** Next.js 16.3, React 19, TypeScript estrito, Tailwind 4 (`@theme` em `src/app/globals.css`), Prisma 7 + MySQL (docker compose de dev), `next/font/google` (Inter), Playwright MCP para verificar no navegador.

---

## Contexto que o executor precisa saber

- **Fonte do design:** `D:\Github\plfcore\NOVO DESIGN\Redesign-A2-Cockpit-Quadrado.dc.html` (página) + `GaugeQuadrado.dc.html` (gauge). O thumbnail do canvas mostra essa variante como a final. As outras (A, B, C) são alternativas descartadas — **não** misturar.
- **Por que A2 e não A/B/C:** é a variante "quadrada" (raio 2px em botão, 0 em card, linhas `#191919`, fundo `#0b0b0b`), coerente com o app PAINEL preto+amarelo. Se o usuário disser que queria outra, este plano não serve — parar e avisar.
- **Repo:** `D:\Github\plfcore` (git na raiz). O site fica em `web/`. Rodar comandos npm **dentro de `web/`**.
- **Estado sujo pré-existente:** `app/src/shell/shell.css` tem alteração não commitada que NÃO é deste trabalho. Nunca usar `git add -A`/`git add .`; sempre listar os caminhos.
- **Honestidade de dados (inegociável):** o cockpit do hero anima números inventados. No design A2 ele diz "LEITURA AO VIVO" — isso viola a regra. Aqui ele leva o selo `ILUSTRAÇÃO — SEM DADOS MEDIDOS` no lugar de "LEITURA AO VIVO". Sem exceção.
- **Planos vêm do banco** (`getPlans()` em `src/app/(publico)/_shared.tsx`). Nomes no seed: `15 DIAS`, `30 DIAS` (featured), `VITALÍCIO`. Nunca hardcodar preço.
- **Ambiente dev Windows (PowerShell).** MySQL local: `docker compose -f docker-compose.dev.yml up -d` (porta 3307). `.env` já existe em `web/`.
- **Comandos:** `npm run build` (gate — precisa passar), `npm run dev` (http://localhost:3000), `npm test` (vitest, não cobre UI).
- **Commits:** pt-BR, `tipo(escopo): descrição`, **sem Co-Authored-By**, sem `--no-verify`.

### O que este plano NÃO faz (decidido, não esquecido)

- Não aplica A2 nas páginas internas (painel, admin, afiliado, revenda, legal). Elas só herdam tokens (fundo mais escuro, cards quadrados, botões com tracking maior). `.type-display` (44 arquivos) **não** muda — a landing usa utilitários Tailwind nos títulos.
- Não implementa o count-up do preço (número animando de 0 até o valor lê como número inventado; além disso é YAGNI).
- Não recria as seções "Como funciona", "Transparência", "O jeito genérico vs PLF" e o bloco "Baixe só daqui" — A2 as removeu. Os redirects antigos passam a apontar para `/#modulos` / `/legal/privacidade`.
- Não mexe no app Tauri (`app/`).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `.gitignore` (raiz) | Modificar | ignorar `NOVO DESIGN/uploads/` e `.thumbnail` |
| `web/src/app/layout.tsx` | Modificar | Inter com pesos 800 e 900 |
| `web/src/app/globals.css` | Substituir | tokens A2, botões, kicker, LED quadrado, sweep, reveal, hazard 5px |
| `web/src/components/site-header.tsx` | Substituir | header A2: logo, O QUE FAZ, PLANOS, ENTRAR/PAINEL, COMPRAR |
| `web/src/components/mobile-menu.tsx` | Modificar | mesmos links no celular |
| `web/src/components/site-footer.tsx` | Substituir | footer A2 mínimo + links legais em caps |
| `web/src/components/cockpit-demo.tsx` | Criar | ilha client: 3 gauges + sparkline animados + leituras + selo |
| `web/src/app/page.tsx` | Substituir | landing A2 (hero, módulos, planos) |
| `web/next.config.ts` | Modificar | redirects das âncoras removidas |

---

### Task 0: Versionar o design e os prints

**Files:**
- Modify: `.gitignore` (raiz do repo)
- Add: `NOVO DESIGN/` (menos uploads e thumbnail), `web/public/shots/*.png`

- [ ] **Step 1: Ignorar lixo do canvas**

Acrescentar ao final de `D:\Github\plfcore\.gitignore`:

```gitignore
NOVO DESIGN/uploads/
NOVO DESIGN/.thumbnail
```

- [ ] **Step 2: Conferir o que vai entrar**

```powershell
cd D:\Github\plfcore
git add ".gitignore" "NOVO DESIGN" "web/public/shots"
git status --short
```

Esperado: apenas `.gitignore`, arquivos de `NOVO DESIGN/` (html, support.js, assets/*.png) e `web/public/shots/*.png`. **Nada** de `uploads/`, `.thumbnail` ou `app/src/shell/shell.css`.

- [ ] **Step 3: Commit**

```powershell
git commit -m "chore(design): versiona canvas do redesign A2 e prints do app"
```

---

### Task 1: Fontes e tokens globais

**Files:**
- Modify: `web/src/app/layout.tsx:7-11`
- Replace: `web/src/app/globals.css`

- [ ] **Step 1: Inter com pesos pesados**

Em `web/src/app/layout.tsx`, trocar o bloco da fonte:

```ts
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
})
```

- [ ] **Step 2: Substituir `web/src/app/globals.css` inteiro por:**

```css
@import 'tailwindcss';

/* ===== PLF CORE — painel quadrado, preto real + amarelo de ação =====
   Fonte do design: NOVO DESIGN/Redesign-A2-Cockpit-Quadrado.dc.html
   Inter em tudo. Amarelo = ação. Vermelho = marca/erro. Canto redondo só 2px em controle. */

@theme {
  --color-void: #0b0b0b;
  --color-carbon: #0e0e0e;
  --color-steel: #101010;
  --color-surface-2: #141414;
  --color-surface-3: #1a1a1a;
  --color-line: #191919;
  --color-edge: #191919;
  --color-edge-2: #2e2e2e;
  --color-signal: #f8e800;
  --color-blood: #e5262b;
  --color-ink-1: #ffffff;
  --color-ink-2: #c9c9c9;
  --color-ink-3: #8a8a8a;
  --color-ink-4: #5a5a5a;
  /* aliases das telas fora do redesign (admin/afiliado/revenda) */
  --color-heat: #f8e800;
  --color-rust: #2e2e2e;

  --font-ui: var(--font-inter), 'Segoe UI', sans-serif;
  --font-mono: var(--font-inter), 'Segoe UI', sans-serif;

  --radius-card: 0px;
  --radius-ctl: 2px;
}

:root {
  --t-fast: 120ms;
  --t-base: 180ms;
  --t-page: 260ms;
  --expo: cubic-bezier(0.16, 1, 0.3, 1);
}

.circle {
  border-radius: 50%;
}

html {
  scroll-behavior: smooth;
}

body {
  background: var(--color-void);
  color: var(--color-ink-2);
  font-family: var(--font-ui);
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
}

/* ===== tipografia ===== */
.type-display {
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--color-ink-1);
  text-wrap: balance;
}
.type-mono,
.type-num {
  font-variant-numeric: tabular-nums;
}
.type-kicker {
  font-weight: 800;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  color: var(--color-ink-3);
}

/* ===== superfícies ===== */
.surface,
.chamfer {
  position: relative;
  background: var(--color-carbon);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
}
.surface--flat,
.chamfer--flat {
  background: var(--color-void);
  border-color: var(--color-line);
}
.surface-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 16px;
  background: var(--color-steel);
  border-bottom: 1px solid var(--color-line);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--color-ink-1);
}
.surface > .surface-head {
  margin: -1px -1px 0;
}
.brackets > .bk {
  display: none;
}

/* linha de dado: label cinza à esquerda, valor branco à direita */
.datarow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 32px;
  padding: 0 12px;
  background: var(--color-surface-2);
  font-size: 12px;
}
.datarow + .datarow {
  margin-top: 1px;
}
.datarow > dt,
.datarow > .k {
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 10px;
  color: var(--color-ink-3);
}
.datarow > dd,
.datarow > .v {
  font-weight: 700;
  color: var(--color-ink-1);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* ===== botões ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 20px;
  border-radius: var(--radius-ctl);
  border: 1px solid transparent;
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  transition:
    filter var(--t-fast) var(--expo),
    transform var(--t-fast) var(--expo),
    background var(--t-fast) var(--expo);
}
.btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.btn:active:not(:disabled) {
  transform: translateY(0);
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.btn--primary {
  background: var(--color-signal);
  border-color: var(--color-signal);
  color: var(--color-void);
}
.btn--ghost {
  background: transparent;
  border-color: var(--color-edge-2);
  color: var(--color-ink-1);
}
/* botão dentro do plano em destaque (card amarelo) */
.btn--inverse {
  background: var(--color-void);
  border-color: var(--color-void);
  color: var(--color-signal);
}
.btn--danger {
  background: rgba(229, 38, 43, 0.1);
  border-color: var(--color-blood);
  color: var(--color-blood);
}
.btn--sm {
  min-height: 36px;
  padding: 0 20px;
  font-size: 11px;
}
.btn--lg {
  min-height: 52px;
  padding: 0 30px;
  font-size: 13.5px;
}

/* ===== inputs ===== */
.field {
  width: 100%;
  min-height: 42px;
  padding: 10px 12px;
  color: var(--color-ink-1);
  font-family: var(--font-ui);
  font-size: 14px;
  background: var(--color-void);
  border: 1px solid var(--color-edge-2);
  border-radius: var(--radius-ctl);
  outline: none;
  transition: border-color var(--t-fast) var(--expo);
}
.field:focus {
  border-color: var(--color-signal);
}
.field::placeholder {
  color: var(--color-ink-4);
}
select.field {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='none' stroke='%238a8a8a' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 32px;
}
input[type='checkbox'],
input[type='radio'] {
  accent-color: var(--color-signal);
}

/* ===== pílulas (quadradas) ===== */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-ctl);
  background: var(--color-surface-3);
  border: 1px solid var(--color-edge-2);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pill--ok {
  color: var(--color-ink-1);
}
.pill--warn {
  color: var(--color-signal);
  border-color: rgba(248, 232, 0, 0.4);
  background: rgba(248, 232, 0, 0.07);
}
.pill--danger {
  color: var(--color-blood);
  border-color: rgba(229, 38, 43, 0.5);
  background: rgba(229, 38, 43, 0.08);
}
.pill--signal {
  background: var(--color-signal);
  border-color: var(--color-signal);
  color: var(--color-void);
}

/* LED quadrado, pisca devagar. Sem glow. */
@keyframes plfLed {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
.led {
  display: inline-block;
  width: 6px;
  height: 6px;
  background: var(--color-signal);
  animation: plfLed 2.4s ease-in-out infinite;
}

/* linha de varredura de 1px no topo de um bloco (cockpit) */
@keyframes plfSweep {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(220%);
  }
}
.sweep {
  position: relative;
  overflow: hidden;
}
.sweep::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 34%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--color-signal), transparent);
  animation: plfSweep 4.4s linear infinite;
}

/* reveal ao rolar, sem JS: só onde o navegador suporta scroll-driven animation */
@keyframes plfReveal {
  from {
    opacity: 0;
    transform: translateY(22px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .reveal {
      animation: plfReveal 0.8s var(--expo) both;
      animation-timeline: view();
      animation-range: entry 0% cover 30%;
    }
  }
}

/* ===== progresso — barra lisa amarela ===== */
.progress {
  height: 8px;
  background: var(--color-surface-3);
  overflow: hidden;
}
.progress > i {
  display: block;
  height: 100%;
  background: var(--color-signal);
}
.progress--hot > i {
  background: var(--color-blood);
}

/* faixa de zona destrutiva / destaque: 5px amarelo-preto no topo do card */
.hazard-bar {
  height: 5px;
  background: repeating-linear-gradient(-45deg, var(--color-signal) 0 8px, var(--color-void) 8px 16px);
}
.hazard {
  background-image: repeating-linear-gradient(-45deg, rgba(248, 232, 0, 0.14) 0 8px, transparent 8px 16px);
}

.rule-fade {
  height: 1px;
  background: var(--color-line);
}

/* selo obrigatório em qualquer dado ilustrativo */
.demo-seal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--radius-ctl);
  background: rgba(248, 232, 0, 0.07);
  border: 1px solid rgba(248, 232, 0, 0.4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-signal);
  white-space: nowrap;
}

:focus-visible {
  outline: 2px solid var(--color-signal);
  outline-offset: 2px;
}

::selection {
  background: rgba(248, 232, 0, 0.3);
  color: var(--color-ink-1);
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-edge-2);
  border: 2px solid var(--color-void);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 150ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Build**

```powershell
cd D:\Github\plfcore\web
npm run build
```

Esperado: `✓ Compiled successfully` sem erro de TypeScript. (Warnings de Tailwind sobre classes desconhecidas não existem no v4; erro aqui significa CSS inválido.)

- [ ] **Step 4: Commit**

```powershell
cd D:\Github\plfcore
git add web/src/app/layout.tsx web/src/app/globals.css
git commit -m "feat(web): tokens do design A2 — preto real, cards quadrados, Inter 800/900"
```

---

### Task 2: Header, menu mobile e footer

**Files:**
- Replace: `web/src/components/site-header.tsx`
- Modify: `web/src/components/mobile-menu.tsx:15-58`
- Replace: `web/src/components/site-footer.tsx`

- [ ] **Step 1: Substituir `web/src/components/site-header.tsx` por:**

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { hasStaffRole } from '@/lib/auth'
import { currentUser } from '@/lib/session'
import { MobileMenu } from './mobile-menu'

// Navegação comercial vive na landing — âncoras funcionam de qualquer página.
const NAV = [
  { href: '/#modulos', label: 'O QUE FAZ' },
  { href: '/#planos', label: 'PLANOS' },
] as const

export function Logo({ className = 'h-5' }: { className?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name} — início`}>
      <Image src="/brand/logo-header.png" alt="Pro League" width={317} height={106} priority className={`${className} w-auto`} />
      <span className="text-[10px] font-bold tracking-[0.24em] text-ink-3">CORE</span>
    </Link>
  )
}

export async function SiteHeader() {
  const user = await currentUser()
  // Staff entra direto na própria área; o painel de cliente continua acessível por lá.
  const area = user
    ? hasStaffRole(user, 'SUPPORT')
      ? { href: '/admin', label: 'ADMIN' }
      : { href: '/painel', label: 'PAINEL' }
    : { href: '/entrar', label: 'ENTRAR' }
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-void/90 backdrop-blur-[10px]">
      <div className="relative mx-auto flex h-[60px] w-full max-w-6xl items-center gap-4 px-4">
        <Logo />

        <div className="ml-auto hidden items-center gap-[18px] md:flex">
          <nav className="flex items-center gap-[18px]" aria-label="Navegação principal">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[11px] font-bold tracking-[0.16em] text-ink-3 transition-colors hover:text-ink-1"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href={area.href}
              className="text-[11px] font-bold tracking-[0.16em] text-ink-3 transition-colors hover:text-ink-1"
            >
              {area.label}
            </Link>
          </nav>
          <Link href="/#planos" className="btn btn--primary btn--sm">
            COMPRAR
          </Link>
        </div>

        <MobileMenu nav={NAV} area={area} />
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Substituir `web/src/components/mobile-menu.tsx` por:**

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

// Ilha client mínima: só o menu do celular precisa de estado.
export function MobileMenu({
  nav,
  area,
}: {
  nav: readonly { href: string; label: string }[]
  area: { href: string; label: string }
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="ml-auto md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        onClick={() => setOpen(!open)}
        className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-ctl border border-edge-2 bg-transparent"
      >
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? 'translate-y-1 rotate-45' : ''}`} />
        <span aria-hidden className={`block h-0.5 w-4 bg-ink-1 transition-transform ${open ? '-translate-y-1 -rotate-45' : ''}`} />
      </button>

      {open && (
        <nav aria-label="Menu" className="absolute inset-x-0 top-full border-b border-line bg-void">
          <ul className="px-4 py-2">
            {[...nav, area].map((item) => (
              <li key={item.href} className="border-b border-line last:border-0">
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-3.5 text-[12px] font-bold tracking-[0.16em] text-ink-1"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="py-4">
              <Link href="/#planos" onClick={() => setOpen(false)} className="btn btn--primary w-full">
                COMPRAR
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Substituir `web/src/components/site-footer.tsx` por:**

```tsx
import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { Logo } from './site-header'

const LINKS: { href: string; label: string }[] = [
  { href: '/download', label: 'Download' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/status', label: 'Status' },
  { href: '/legal/termos', label: 'Termos de uso' },
  { href: '/legal/privacidade', label: 'Privacidade' },
  { href: '/legal/reembolso', label: 'Reembolso' },
]

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-6">
        <Logo className="h-4" />
        <nav aria-label="Rodapé">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-4 transition-colors hover:text-ink-1"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="type-num w-full text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-4 lg:w-auto">
          © {new Date().getFullYear()} {BRAND.fullName} · Sem dados simulados
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Build**

```powershell
cd D:\Github\plfcore\web
npm run build
```

Esperado: passa. Se reclamar de `area` possivelmente `null` em algum outro lugar que use `MobileMenu`, é porque só o header usa — confirmar com `grep -rn "MobileMenu" src`.

- [ ] **Step 5: Commit**

```powershell
cd D:\Github\plfcore
git add web/src/components/site-header.tsx web/src/components/mobile-menu.tsx web/src/components/site-footer.tsx
git commit -m "feat(web): header e footer no design A2"
```

---

### Task 3: Cockpit ilustrativo (ilha client)

**Files:**
- Create: `web/src/components/cockpit-demo.tsx`

Gauge copiado de `NOVO DESIGN/GaugeQuadrado.dc.html`; animação copiada do `startGauges`/`startSpark` do A2. Valores iniciais são determinísticos (SSR e client rendem igual — sem erro de hidratação); o `random` só entra no `useEffect`.

- [ ] **Step 1: Criar `web/src/components/cockpit-demo.tsx`:**

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { BRAND } from '@/lib/brand'
import { DemoSeal } from './ui'

// Cockpit ilustrativo da landing. Agulhas e telemetria andam com valores inventados —
// por isso o selo ILUSTRAÇÃO fica no cabeçalho. Nada aqui é lido da máquina do visitante.

const GAUGES = [
  { key: 'cpu', label: 'CPU', sub: 'RYZEN 7 5800X', base: 21 },
  { key: 'gpu', label: 'GPU', sub: 'RTX 3080', base: 37 },
  { key: 'ram', label: 'RAM', sub: '32 GB DDR4', base: 41 },
] as const

const LEITURAS: [string, string][] = [
  ['SISTEMA', 'WINDOWS 11 PRO 23H2'],
  ['PLANO DE ENERGIA', 'EQUILIBRADO'],
  ['DISCO PRINCIPAL', '610 / 1000 GB'],
  ['MONITOR', '1920×1080 @ 165 HZ'],
  ['FONTE DAS LEITURAS', 'WMI · NVIDIA-SMI'],
]

const ARC = 395.8 // comprimento do arco de 270° com r=84
const SPARK_N = 60

const needleRotate = (v: number) => `rotate(${(-135 + v * 2.7).toFixed(2)} 100 100)`
const arcDash = (v: number) => `${((ARC * v) / 100).toFixed(1)} 999`
const sparkPath = (arr: number[]) =>
  arr
    .map((v, i) => `${i ? 'L' : 'M'}${((i * 600) / (SPARK_N - 1)).toFixed(1)} ${(110 - v * 0.9).toFixed(1)}`)
    .join(' ')

function Gauge({ gkey, label, sub, base }: { gkey: string; label: string; sub: string; base: number }) {
  return (
    <div data-gauge={gkey} className="flex flex-col items-center gap-2.5 bg-carbon px-4 py-5">
      <svg viewBox="0 0 200 138" className="block w-full max-w-[152px]" aria-hidden>
        <path d="M 21.07 128.73 A 84 84 0 1 1 178.93 128.73" fill="none" stroke="#242424" strokeWidth="7" />
        <path d="M 28.58 126 A 76 76 0 1 1 171.42 126" fill="none" stroke="#333333" strokeWidth="6" strokeDasharray="1.2 13.4" />
        <path d="M 176.74 65.84 A 84 84 0 0 1 178.93 128.73" fill="none" stroke="#e5262b" strokeWidth="7" />
        <path
          data-arc
          d="M 21.07 128.73 A 84 84 0 1 1 178.93 128.73"
          fill="none"
          stroke="#f8e800"
          strokeWidth="7"
          strokeDasharray={arcDash(base)}
        />
        <line x1="100" y1="20" x2="100" y2="31" stroke="#6e6e6e" strokeWidth="2" />
        <text x="45.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6e6e6e">0</text>
        <text x="100" y="45" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6e6e6e">50</text>
        <text x="154.5" y="122.84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e5262b">100</text>
        <g data-needle transform={needleRotate(base)}>
          <polygon points="98.4,100 101.6,100 100.6,26 99.4,26" fill="#ffffff" />
          <rect x="97.8" y="100" width="4.4" height="11" fill="rgba(255,255,255,.5)" />
        </g>
        <circle cx="100" cy="100" r="8" fill="#0b0b0b" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2.6" fill="#f8e800" />
      </svg>
      <div className="text-center">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-3">{label}</p>
        <p className="type-num mt-1 text-[2.1rem] font-black leading-none tracking-[-0.03em] text-ink-1">
          <span data-val>{base}</span>
          <span className="text-[15px] font-bold text-ink-3">%</span>
        </p>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-3">{sub}</p>
      </div>
    </div>
  )
}

export function CockpitDemo() {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = root.current
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const gauges = GAUGES.map((g) => {
      const el = host.querySelector<HTMLElement>(`[data-gauge="${g.key}"]`)!
      return {
        base: g.base,
        cur: g.base,
        target: g.base,
        needle: el.querySelector<SVGGElement>('[data-needle]')!,
        arc: el.querySelector<SVGPathElement>('[data-arc]')!,
        val: el.querySelector<HTMLElement>('[data-val]')!,
      }
    })
    let tick = 0
    const gaugeTimer = setInterval(() => {
      tick += 1
      for (const g of gauges) {
        if (tick % 24 === 0) g.target = Math.max(8, Math.min(88, g.base + (Math.random() - 0.4) * 22))
        g.cur += (g.target - g.cur) * 0.12
        g.needle.setAttribute('transform', needleRotate(g.cur))
        g.arc.setAttribute('stroke-dasharray', arcDash(g.cur))
        g.val.textContent = String(Math.round(g.cur))
      }
    }, 60)

    const series = {
      cpu: Array.from({ length: SPARK_N }, () => 22 + Math.random() * 8),
      gpu: Array.from({ length: SPARK_N }, () => 36 + Math.random() * 8),
    }
    const paths = {
      cpu: host.querySelector<SVGPathElement>('[data-spark="cpu"]')!,
      gpu: host.querySelector<SVGPathElement>('[data-spark="gpu"]')!,
    }
    const step = () => {
      for (const k of ['cpu', 'gpu'] as const) {
        const base = k === 'cpu' ? 24 : 38
        const last = series[k][SPARK_N - 1]
        series[k].push(Math.max(8, Math.min(92, last + (Math.random() - 0.5) * 9 + (base - last) * 0.12)))
        series[k].shift()
        paths[k].setAttribute('d', sparkPath(series[k]))
      }
    }
    step()
    const sparkTimer = setInterval(step, 420)

    return () => {
      clearInterval(gaugeTimer)
      clearInterval(sparkTimer)
    }
  }, [])

  return (
    <div ref={root} className="flex h-full flex-col bg-carbon">
      <div className="sweep border-b border-line">
        <div className="flex min-h-11 items-center gap-2.5 bg-steel px-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-ink-1">
          COCKPIT
          <span className="ml-auto">
            <DemoSeal>ILUSTRAÇÃO — SEM DADOS MEDIDOS</DemoSeal>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-line bg-line max-[420px]:grid-cols-1">
        {GAUGES.map((g) => (
          <Gauge key={g.key} gkey={g.key} label={g.label} sub={g.sub} base={g.base} />
        ))}
      </div>

      <div className="px-4 pb-[18px] pt-4">
        <div className="flex items-center justify-between gap-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-ink-3">
          <span>Telemetria — últimos 60 s</span>
          <span className="flex gap-3.5">
            <span className="text-signal">— CPU</span>
            <span>-- GPU</span>
          </span>
        </div>
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="mt-3 block h-[124px] w-full" aria-hidden>
          <g stroke="#171717" strokeWidth="1">
            <line x1="0" y1="30" x2="600" y2="30" />
            <line x1="0" y1="60" x2="600" y2="60" />
            <line x1="0" y1="90" x2="600" y2="90" />
          </g>
          <path data-spark="gpu" fill="none" stroke="#5a5a5a" strokeWidth="2" strokeDasharray="5 6" />
          <path data-spark="cpu" fill="none" stroke="#f8e800" strokeWidth="2.4" />
        </svg>
      </div>

      <dl className="grid flex-1 auto-rows-fr gap-px border-t border-line bg-line">
        {LEITURAS.map(([k, v]) => (
          <div key={k} className="flex min-h-[30px] items-center justify-between gap-3 bg-carbon px-4">
            <dt className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-3">{k}</dt>
            <dd className="type-num text-[11.5px] font-bold tracking-[0.06em] text-ink-1">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-steel px-4 py-[11px] text-[10px] font-extrabold uppercase tracking-[0.16em] text-ink-3">
        <span className="flex items-center gap-2">
          <span className="led" aria-hidden />
          {BRAND.name}
        </span>
        <span>SISTEMA // PRONTO</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check (o arquivo ainda não é importado, mas o tsc do build cobre tudo)**

```powershell
cd D:\Github\plfcore\web
npx tsc --noEmit
```

Esperado: sem erro. Se reclamar do `!` (non-null), o `tsconfig` está com `strict` — os `!` são intencionais: o markup é nosso, os nós existem.

- [ ] **Step 3: Commit**

```powershell
cd D:\Github\plfcore
git add web/src/components/cockpit-demo.tsx
git commit -m "feat(web): cockpit ilustrativo animado com selo de demonstração"
```

---

### Task 4: Landing (`page.tsx`)

**Files:**
- Replace: `web/src/app/page.tsx`

- [ ] **Step 1: Confirmar as dimensões do print (já medidas: 1920×1080)**

```powershell
Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Image]::FromFile("D:\Github\plfcore\web\public\shots\fps-booster.png")
"$($i.Width) $($i.Height)"
$i.Dispose()
```

Esperado: `1920 1080`. Se o arquivo tiver sido trocado e der outro valor, ajustar `SHOT_W`/`SHOT_H` no código abaixo (`next/image` distorce se errar).

- [ ] **Step 2: Substituir `web/src/app/page.tsx` por:**

```tsx
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CockpitDemo } from '@/components/cockpit-demo'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { DemoSeal } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { formatCents } from '@/lib/money'
import { AVISO_LICENCA_INSTALACAO } from '@/lib/termos'
import { getPlans } from './(publico)/_shared'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — Seu PC medido, não prometido` },
  description: `O ${BRAND.name} lê CPU, GPU, RAM e discos do seu Windows, declara a fonte de cada número e guarda o estado anterior de tudo que altera. App oficial do servidor Pro League. Licença no painel, pagamento por PIX ou cartão.`,
  openGraph: {
    title: `${BRAND.name} — Seu PC medido, não prometido`,
    description: 'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e registradas.',
  },
}

// ===== conteúdo real (fonte: app) =====

const SELOS: [string, string][] = [
  ['Sistema', 'Windows 10 e 11'],
  ['Leituras', 'Ficam na sua máquina'],
  ['Licença', '1 instalação'],
]

const MODULOS: { codigo: string; nome: string; desc: string }[] = [
  { codigo: 'INST-01', nome: 'Cockpit', desc: 'CPU, GPU e RAM ao vivo, telemetria de 60 s e a fonte de cada leitura na tela.' },
  { codigo: 'INST-02', nome: 'FPS Booster', desc: 'Pacotes de aceleração com o estado real lido da máquina — reversíveis pelo mesmo interruptor.' },
  { codigo: 'INST-03', nome: 'Limpeza', desc: 'Temporários conhecidos mostrados antes de remover. Documentos, fotos e saves ficam fora.' },
  { codigo: 'INST-04', nome: 'Raio-X', desc: 'Inventário de CPU, placa-mãe, memória, discos e GPU. Sem fonte, o campo diz NÃO DISPONÍVEL.' },
  { codigo: 'INST-05', nome: 'Windows', desc: 'Energia, Game Mode e efeitos visuais — cada item espera a sua confirmação.' },
  { codigo: 'INST-06', nome: 'FiveM', desc: 'Cache limpo com as pastas de conta protegidas. Preparado para o servidor Pro League.' },
]

// dimensões reais de public/shots/fps-booster.png
const SHOT_W = 1920
const SHOT_H = 1080

function StatusBar({ children, top = false }: { children: ReactNode; top?: boolean }) {
  return (
    <div className={`reveal flex items-center gap-3.5 border-b border-line py-[18px] ${top ? 'border-t' : ''}`}>
      <span className="led" aria-hidden />
      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.24em] text-ink-3">{children}</span>
    </div>
  )
}

function SectionTitle({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid items-end gap-7 py-14 md:grid-cols-2">
      <h2 className="reveal text-[1.8rem] font-black uppercase leading-none tracking-[-0.04em] text-ink-1 md:text-[3rem]">
        {title}
      </h2>
      <p className="reveal max-w-[440px] text-[15px] leading-[1.6] text-ink-3">{lead}</p>
    </div>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>
}) {
  const [plans, params] = await Promise.all([getPlans(), searchParams])
  const novaInstalacao = params.intent === 'nova'
  const comprarQuery = novaInstalacao ? '?intent=nova' : ''

  const prices = plans
    .map((p) => p.prices[0]?.amountCents)
    .filter((v): v is number => typeof v === 'number')
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: BRAND.name,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Windows 10, Windows 11',
      description:
        'Diagnóstico e otimização do Windows com dados reais, alterações explicadas e registradas — reversão quando o Windows permite.',
      offers:
        prices.length > 0
          ? {
              '@type': 'AggregateOffer',
              priceCurrency: 'BRL',
              lowPrice: (Math.min(...prices) / 100).toFixed(2),
              highPrice: (Math.max(...prices) / 100).toFixed(2),
              offerCount: prices.length,
            }
          : undefined,
    },
  ]

  return (
    <>
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="flex-1">
        {/* ================= HERO ================= */}
        <section className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl lg:grid-cols-2">
            <div className="reveal px-4 pb-14 pt-14 md:pt-[72px] lg:border-r lg:border-line lg:pb-[76px] lg:pr-10">
              <p className="flex items-center gap-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-ink-3">
                <span className="led" aria-hidden />
                App oficial · servidor Pro League
              </p>
              <h1 className="mt-6 text-[2.6rem] font-black uppercase leading-[1.02] tracking-[-0.05em] text-ink-1 sm:text-[3.4rem] xl:text-[4.6rem]">
                Seu PC
                <br />
                medido —
                <br />
                <span className="text-signal">não prometido.</span>
              </h1>
              <p className="mt-6 max-w-[470px] text-[16.5px] leading-[1.6] text-ink-2">
                O {BRAND.name} lê CPU, GPU, RAM e discos do seu Windows, declara a fonte de cada número e
                guarda o estado anterior de tudo que altera. Você confirma, o app mede de novo.
              </p>
              <div className="mt-8 flex flex-wrap gap-2.5">
                <a href="#planos" className="btn btn--primary btn--lg">
                  COMPRAR LICENÇA
                </a>
                <a href="#modulos" className="btn btn--ghost btn--lg">
                  O QUE FAZ
                </a>
              </div>
              <dl className="mt-[30px] grid gap-px border border-line bg-line">
                {SELOS.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 bg-carbon px-3.5 py-[11px] text-[10.5px] font-bold uppercase tracking-[0.14em]"
                  >
                    <dt className="text-[#6e6e6e]">{k}</dt>
                    <dd className="text-ink-1">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="reveal lg:mb-[76px]">
              <CockpitDemo />
            </div>
          </div>
        </section>

        {/* ================= MÓDULOS ================= */}
        <section id="modulos" className="scroll-mt-[60px]">
          <div className="mx-auto w-full max-w-6xl px-4">
            <StatusBar>Módulos do app — 06 instrumentos</StatusBar>
            <SectionTitle
              title="O que o app faz"
              lead="Cada instrumento diz de onde vem o dado, o que pretende mudar e mede de novo depois da sua confirmação."
            />

            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {MODULOS.map((m) => (
                <div key={m.codigo} className="reveal bg-carbon px-[22px] pb-[26px] pt-6 transition-colors hover:bg-surface-2">
                  <div className="flex items-center gap-2.5">
                    <span className="type-num text-[10px] font-extrabold tracking-[0.2em] text-signal">{m.codigo}</span>
                    <span className="h-px flex-1 bg-[#1e1e1e]" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-[17px] font-black uppercase tracking-[0.02em] text-ink-1">{m.nome}</h3>
                  <p className="mt-2 text-sm leading-[1.55] text-ink-3">{m.desc}</p>
                </div>
              ))}
            </div>

            <figure className="reveal mt-7 border border-line">
              <figcaption className="flex items-center gap-3 border-b border-line bg-steel px-3.5 py-[11px] text-[9.5px] font-extrabold uppercase tracking-[0.2em] text-[#6e6e6e]">
                <span>{BRAND.name} — FPS Booster</span>
                <span className="ml-auto text-signal">Tela real do app</span>
              </figcaption>
              <Image
                src="/shots/fps-booster.png"
                alt={`Tela FPS Booster do ${BRAND.name}`}
                width={SHOT_W}
                height={SHOT_H}
                sizes="(min-width: 1152px) 1120px, 100vw"
                className="block h-auto w-full"
              />
            </figure>
          </div>
        </section>

        {/* ================= PLANOS ================= */}
        <section id="planos" className="scroll-mt-[60px]">
          <div className="mx-auto w-full max-w-6xl px-4 pb-24">
            <div className="mt-[88px]">
              <StatusBar top>Licença — emissão imediata no painel</StatusBar>
            </div>
            <SectionTitle
              title="Planos"
              lead="Mesmo app em todos. Muda a duração. Uma licença vale para 1 instalação do Windows."
            />
            {novaInstalacao && (
              <div className="mb-4">
                <DemoSeal>Compra para nova instalação — será emitida uma chave nova</DemoSeal>
              </div>
            )}

            <div className="grid gap-px border border-line bg-line md:grid-cols-3">
              {plans.map((plan) => {
                const price = plan.prices[0]
                if (!price) return null
                const destaque = plan.featured
                const valor = formatCents(price.amountCents).replace('R$', '').trim()
                const duracao = plan.durationDays === null ? 'Sem expiração' : `${plan.durationDays} dias`
                const instalacoes = plan.deviceLimit === 1 ? '1 instalação' : `${plan.deviceLimit} instalações`
                return (
                  <div
                    key={plan.id}
                    className={`reveal relative flex flex-col px-[26px] pb-[30px] pt-[34px] transition-colors ${
                      destaque ? 'bg-signal hover:bg-[#ffef2e]' : 'bg-carbon hover:bg-surface-2'
                    }`}
                  >
                    {destaque && <div className="hazard-bar absolute inset-x-0 top-0" aria-hidden />}
                    <p
                      className={`text-[10.5px] font-black uppercase tracking-[0.22em] ${
                        destaque ? 'text-void/70' : 'text-ink-3'
                      }`}
                    >
                      {plan.name}
                      {destaque && ' · recomendado'}
                    </p>
                    <p className={`type-num mt-[22px] flex items-end gap-1.5 ${destaque ? 'text-void' : 'text-ink-1'}`}>
                      <span className="text-sm font-bold opacity-55">R$</span>
                      <span className="text-[3.3rem] font-black leading-[0.85] tracking-[-0.05em]">{valor}</span>
                    </p>
                    <p
                      className={`mt-3 text-[10.5px] font-extrabold uppercase tracking-[0.16em] ${
                        destaque ? 'text-void/70' : 'text-ink-3'
                      }`}
                    >
                      {duracao} · {instalacoes}
                    </p>
                    <Link
                      href={`/comprar/${plan.slug}${comprarQuery}`}
                      className={`btn mt-7 w-full ${destaque ? 'btn--inverse' : 'btn--ghost'}`}
                    >
                      COMPRAR
                    </Link>
                  </div>
                )
              })}
            </div>

            <div className="reveal mt-[22px] flex flex-wrap gap-x-7 gap-y-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-4">
              <span>PIX · cartão</span>
              <span>Chave no painel após o pagamento</span>
            </div>
            {/* regra crítica da licença — visível, sem letra miúda */}
            <p className="reveal mt-4 max-w-[640px] text-[13px] leading-[1.65] text-ink-3">
              {AVISO_LICENCA_INSTALACAO} Renovar mantém a instalação atual. A regra aparece de novo, com
              confirmação, antes do pagamento.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}
```

- [ ] **Step 3: Build**

```powershell
cd D:\Github\plfcore\web
npm run build
```

Esperado: passa. Erros prováveis e correção:
- `Property 'deviceLimit' does not exist` → conferir o nome do campo em `prisma/schema.prisma` (model `Plan`) e usar o nome real.
- Classe `text-void/70` não aplicando → Tailwind 4 aceita modificador de opacidade em cor do `@theme`; se não renderizar, trocar por `text-[rgba(11,11,11,.7)]`.

- [ ] **Step 4: Commit**

```powershell
cd D:\Github\plfcore
git add web/src/app/page.tsx
git commit -m "feat(web): landing no design A2 — hero com cockpit, módulos e planos quadrados"
```

---

### Task 5: Redirects das âncoras removidas

**Files:**
- Modify: `web/next.config.ts:6-9`

- [ ] **Step 1: Apontar rotas antigas para o que ainda existe**

Trocar as três primeiras entradas de `redirects()`:

```ts
      // conteúdo comercial consolidado na landing única (âncoras)
      { source: '/produto', destination: '/#modulos', permanent: true },
      { source: '/como-funciona', destination: '/#modulos', permanent: true },
      { source: '/transparencia', destination: '/legal/privacidade', permanent: true },
```

O resto do array fica igual.

- [ ] **Step 2: Build + commit**

```powershell
cd D:\Github\plfcore\web
npm run build
cd D:\Github\plfcore
git add web/next.config.ts
git commit -m "chore(web): redirects das secoes removidas da landing"
```

---

### Task 6: Verificação real no navegador

Critério de "pronto" (definido ANTES de olhar o resultado):

1. `http://localhost:3000` a 1280px de largura bate com o thumbnail de `NOVO DESIGN/.thumbnail` (ou com `Redesign-A2-Cockpit-Quadrado.dc.html` aberto direto no navegador): header 60px com COMPRAR amarelo, hero em duas colunas com borda vertical, h1 em 3 linhas com "NÃO PROMETIDO." amarelo, cockpit à direita com 3 gauges + telemetria + 5 leituras, selos em 3 linhas, seções MÓDULOS (grid 3×2 com linhas de 1px) e PLANOS (3 cards, o do meio amarelo com faixa hazard).
2. O cockpit exibe o selo `ILUSTRAÇÃO — SEM DADOS MEDIDOS` e as agulhas se mexem.
3. A 390px: tudo empilha, sem scroll horizontal, menu hambúrguer abre com O QUE FAZ / PLANOS / ENTRAR / COMPRAR.
4. Âncoras `#modulos` e `#planos` existem; header e footer levam a elas; `/produto` e `/como-funciona` redirecionam para `/#modulos`; `/transparencia` para `/legal/privacidade`.
5. Console sem erro de hidratação.
6. `/painel`, `/entrar`, `/download` e `/legal/termos` continuam legíveis com os tokens novos (cards quadrados, fundo mais escuro) — sem nada quebrado.
7. `npm run build` e `npm test` passam.

- [ ] **Step 1: Subir banco e dev server**

```powershell
cd D:\Github\plfcore\web
docker compose -f docker-compose.dev.yml up -d
npm run dev
```

(Se o banco estiver vazio: `npx prisma migrate dev` e `npm run db:seed` antes.) Deixar o dev rodando em background e seguir.

- [ ] **Step 2: Desktop 1280 — screenshot e comparação**

Com o Playwright MCP: `browser_resize` 1280×900 → `browser_navigate` `http://localhost:3000` → `browser_take_screenshot` (salvar em `C:\Users\pc\AppData\Local\Temp\claude\...\scratchpad\landing-1280.png`) → abrir a imagem com Read e comparar com `NOVO DESIGN/.thumbnail` (copiar para `.webp` no scratchpad e abrir com Read). Verificar os itens 1 e 2 do critério.

- [ ] **Step 3: Mobile 390**

`browser_resize` 390×844 → screenshot → conferir item 3. Clicar no hambúrguer (`browser_click`) e conferir os 4 itens do menu. Rodar `browser_evaluate` com `() => document.documentElement.scrollWidth <= window.innerWidth` — esperado `true`.

- [ ] **Step 4: Âncoras, redirects e console**

```js
// browser_evaluate
() => ['modulos', 'planos'].map((id) => !!document.getElementById(id))
```
Esperado `[true, true]`.

Navegar para `/produto`, `/como-funciona`, `/transparencia` e conferir a URL final. `browser_console_messages` → nenhum erro (warnings do Next em dev são ok; "Hydration failed" NÃO é ok).

- [ ] **Step 5: Páginas internas não quebraram**

Navegar em `/entrar`, `/download`, `/legal/termos`, `/painel` (logar com `cliente@plfcore.dev` / senha do seed em `prisma/seed.ts`). Screenshot rápido de cada; conferir item 6.

- [ ] **Step 6: Gates**

```powershell
cd D:\Github\plfcore\web
npm run build
npm test
```

Esperado: build ok; vitest todo verde (os testes não tocam UI — se algum falhar, é ambiente/banco, não este trabalho; reportar sem "ajustar" o teste).

- [ ] **Step 7: Ajustes e commit final**

Se algo do critério falhou, corrigir no arquivo responsável (ver mapa de arquivos) e voltar ao step correspondente. Quando tudo bater:

```powershell
cd D:\Github\plfcore
git status --short
```

Esperado: só `app/src/shell/shell.css` (pré-existente, não mexer). Se houver ajuste pendente do design:

```powershell
git add web/src/app/page.tsx web/src/app/globals.css web/src/components
git commit -m "fix(web): ajustes do design A2 apos verificacao no navegador"
```

- [ ] **Step 8: Relatório**

No resumo final para o usuário, dizer explicitamente: variante aplicada (A2), o que foi verificado no navegador (com os screenshots), o que ficou de fora (lista da seção "O que este plano NÃO faz"), e que a verificação foi manual via Playwright — não há teste automatizado de UI no repo.
