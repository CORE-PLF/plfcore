# PLF CORE — app desktop

App desktop de diagnóstico e otimização de Windows pra gamers, versão oficial do servidor PLF / Pro League. Linguagem visual: painel profissional escuro com acento amarelo (direção "PAINEL" do Claude Design, referência em `../claude-design/04-resultado/PLF CORE - PAINEL.dc.html`). Honestidade radical: nada simulado sem selo, toda ação registrada e reversível.

## Stack e comandos

- React 19 + TypeScript estrito + Vite 7 + Tailwind 4 (`@theme` em `src/styles/index.css`) + zustand. Desktop: Tauri 2.
- `npm run dev` — dev server em http://localhost:1420 (`npx vite --port 1421` se a 1420 estiver ocupada)
- `npm run build` — tsc + vite build (gate de qualidade; precisa passar)
- `npm run tauri dev` / `npm run tauri build` — app desktop (exige Rust + MSVC)

## Design system (REGRA ZERO — inegociável)

- **Cores** (só estas, via tokens do `@theme`): fundos `void #101010` (janela) → `carbon #141414` (barras) → `steel #181818` (card) → `surface-2 #202020` (cabeçalho de card, linha de dado, botão cinza) → `surface-3 #282828` (chip). Bordas `line #222` (separador de linha), `edge #2B2B2B` (card), `edge-2 #3A3A3A` (botão). Texto `ink-1 #fff`, `ink-2 #c9c9c9`, `ink-3 #8a8a8a`, `ink-4 #5a5a5a`.
- **Amarelo `signal #F8E800` = ação.** CTA primário (fundo amarelo, texto preto), item de menu ativo (barra de 3 px), LED vivo, preenchimento de barra, chip de contagem, selo DEMO, valor em destaque. Uma ação primária por tela.
- **Vermelho `blood #E5262B` = marca, erro e perigo.** Zona vermelha do gauge, switch ARMAR armado, botão de segurar, badge SENSÍVEL, erro. Nunca em CTA.
- PROIBIDO: roxo, azul, verde, teal, rosa, laranja, gradiente colorido, grain, scanlines, chanfro, glassmorphism/blur, emoji.
- **Forma**: raio 10 px em card (`.surface`), 6 px em botão/input/linha de dado, 3 px em tag/checkbox, 999 px em pílula/chip/LED. Borda 1 px sempre; sombra nunca.
- **Tipografia**: Inter em tudo (`--font-ui`); JetBrains Mono (`.type-mono`) só em telemetria bruta e log. Números sempre `tabular-nums` (`.type-num`). Título de tela = `ScreenTitle` (kicker 11px caps cinza + título 34px 700 branco em caixa normal). Cabeçalho de card = `.surface-head` (12px 700 caps, letter-spacing .1em). Label de dado = 11px 600 caps cinza; valor = 12–13px 700 branco.
- **Componentes** (`src/components/`): `Surface` (+ `.surface-head`), `Button` (primary/secondary/ghost/danger; lg/md/sm), `.pill` / `.pill--value` / `.chip`, `ProgressBar` (lisa, amarela; `hot` = vermelha), `StatusLED`, `ArmSwitch`, `HoldButton` (carga preenche da esquerda, 900 ms), `KTag`/`DemoTag` (`.tag--*`), `MetricRow`, `.datarow`, `.checkbox`, `Gauge`, `Toast`, `KillFeedItem`, `Modal`, `EmptyState`/`ErrorState`.
- Estado nunca só por cor: sucesso = branco + check; erro = vermelho + ícone; aviso = amarelo + ícone.
- Zona destrutiva = card com `.hazard-bar` (faixa amarela/preta 6 px no topo) + `ArmSwitch` + `HoldButton`. Texto "ARME E SEGURE 0,9 S PARA CONFIRMAR".
- Motion: `--t-fast/base/page`, curva `--expo`. Hover de botão = brightness(1.08) + translateY(-1px). `prefers-reduced-motion` respeitado.
- Densidade: cada tela tem UM elemento dominante (hero). Cards de dado densos; ações respiram. Resolução alvo 1920×1080, sem mobile.

## Copy e i18n

- TODA string de UI vai em dicionário i18n do módulo (`defineDict` de `src/i18n`), com os 5 idiomas: pt (default), en, es, fr, it. Chave faltando = erro de compilação. Componente usa `const t = useT(dict)`.
- Voz curta, técnica, imperativa. Botões e labels em caixa alta; títulos de tela em caixa normal ("Limpeza de disco"). Sem simpatia artificial, sem venda, sem lorem ipsum. Botão mantém o nome no fluxo inteiro (`LIMPAR` → `LIMPEZA CONCLUÍDA`).
- Erros dizem o que houve E o que fazer. pt-BR com acentuação perfeita.
- Nome do produto: SEMPRE via `BRAND` de `src/brand.ts`, nunca hardcoded. Logo: `src/assets/logo-header.png` e `logo-grande.png`.

## Honestidade de dados (inegociável)

- Nunca inventar número (temperatura, %, FPS, espaço). Medido é medido; estimado leva selo `ESTIMADO`; simulado leva `MODO DE DEMONSTRAÇÃO` visível.
- Dados só via `SystemAdapter` (`src/services/`). Campo sem fonte → `NÃO DISPONÍVEL`. Zero scareware.
- Ação destrutiva: switch ARMAR + hold-to-confirm 900ms, registrada no LOG, reversível quando possível.

## Convenções

- Módulo por tela em `src/modules/<nome>/` (componente + i18n.ts próprios). Componentes compartilhados em `src/components/`. Serviços/stores em `src/services/` e `src/stores/`.
- Sem comentário óbvio; só o porquê não-óbvio. Editar arquivo existente > criar novo. Sem refactor oportunista.
- Commits pt-BR `tipo(escopo): descrição`, SEM co-author.
