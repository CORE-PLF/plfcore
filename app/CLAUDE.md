# RESYNC

App desktop de diagnóstico e otimização de Windows para gamers. Estética "cockpit de máquina": preto real + vermelhos, chanfros 45°, zero cara de template de IA. Honestidade radical: nada simulado sem selo, toda ação registrada e reversível.

## Stack e comandos

- React 19 + TypeScript estrito + Vite 7 + Tailwind 4 (`@theme` em `src/styles/index.css`) + zustand. Desktop: Tauri 2.
- `npm run dev` — dev server em http://localhost:1420
- `npm run build` — tsc + vite build (gate de qualidade; precisa passar)
- `npm run tauri dev` / `npm run tauri build` — app desktop (exige Rust + MSVC)

## Regras do design system (REGRA ZERO — inegociável)

- `border-radius` global é 0 (reset em index.css). Círculo literal (LED, agulha) usa a classe `circle`. NUNCA cantos arredondados em card/botão/input.
- Paleta SÓ: `void/carbon/steel` (fundos), `signal` (ação/CTA, único que emite glow), `blood` (marca), `rust` (estrutura), `heat` (atividade), `ink-1..4` (texto), `line/edge` (bordas). PROIBIDO: roxo, azul, verde, teal, rosa, amarelo, gradiente colorido, slate do Tailwind.
- Sucesso = branco (`ink-1`) + check + microcópia. Erro = `signal` + padrão (stripes/borda dupla). Warning = `heat` + ícone. Estado nunca só por cor.
- Chanfros via `clip-path: polygon()`, escala 4/6/8/12px; filho sempre com corte MENOR que o pai. Borda de superfície chanfrada = técnica do `::before` com `inset: 1px` e `clip-path: inherit` (o fundo do elemento É a borda). `border` e `box-shadow` NÃO funcionam com clip-path — sombra só com `filter: drop-shadow()`.
- Fontes: Saira Condensed 800 itálico caps (display, classe `type-display`), Quantico (UI), JetBrains Mono tabular (números/dados, classe `type-mono`). Nenhuma outra.
- Números SEMPRE em mono tabular. Barras de progresso SEMPRE segmentadas (blocos 8px, gap 2px) — nunca lisa, nunca spinner infinito.
- Sem emoji. Sem glassmorphism/backdrop-blur. Glow só em: CTA hover, agulha na zona vermelha, LED vivo, logo na ignição (`--glow-signal`).
- Hazard stripes (classe `hazard`) SÓ em zonas destrutivas. Grain/scanlines/stage-grid já existem como classes utilitárias.
- Motion: tokens `--t-fast/base/page`, curvas `--expo` (padrão) e `--snap` (wipes). Hover = brightness(1.06) + translateY(-1px). `prefers-reduced-motion` respeitado (reset global em index.css).
- Densidade assimétrica: cada tela tem UM elemento dominante. Painéis de dados densos; zonas de ação respiram.

## Copy e i18n

- TODA string de UI vai em dicionário i18n do módulo (`defineDict` de `src/i18n`), com os 5 idiomas: pt (default), en, es, fr, it. Chave faltando = erro de compilação. Componente usa `const t = useT(dict)`.
- Voz de máquina: curta, técnica, imperativa, maiúsculas em títulos/botões. Sem simpatia artificial, sem venda, sem "desbloqueie/eleve/potencialize", sem lorem ipsum. Botão mantém o nome no fluxo inteiro (`LIMPAR` → `LIMPO`).
- Erros dizem o que houve E o que fazer. pt-BR com acentuação perfeita.
- Nome do produto: SEMPRE via `BRAND` de `src/brand.ts`, nunca hardcoded.

## Honestidade de dados (inegociável)

- Nunca inventar número (temperatura, %, FPS, espaço). Medido é medido; estimado leva selo `ESTIMADO`; simulado leva `MODO DE DEMONSTRAÇÃO` visível.
- Dados só via `SystemAdapter` (`src/services/`). Campo sem fonte → `NÃO DISPONÍVEL`. Zero scareware.
- Ação destrutiva: switch ARMAR + hold-to-confirm 900ms, registrada no LOG, reversível quando possível.

## Convenções

- Módulo por tela em `src/modules/<nome>/` (componente + i18n.ts próprios). Componentes compartilhados em `src/components/`. Serviços/stores em `src/services/` e `src/stores/`.
- Sem comentário óbvio; só o porquê não-óbvio. Editar arquivo existente > criar novo. Sem refactor oportunista.
- Commits pt-BR `tipo(escopo): descrição`, SEM co-author.
