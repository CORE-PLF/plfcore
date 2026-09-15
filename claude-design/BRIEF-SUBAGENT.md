# Brief comum — redesign PLF CORE (fase 2, por módulo)

Você é um dos subagents redesenhando o app desktop **PLF CORE** (`D:\Github\plfcore\app`, React 19 + TS + Tailwind 4 + Tauri 2). Outros subagents trabalham AO MESMO TEMPO em outros módulos. Você só edita os arquivos do SEU escopo (listado no seu prompt). Nunca toque em `src/components/`, `src/styles/`, `src/shell/`, `src/stores/`, `src/services/`, `src/i18n/` a menos que o seu prompt liste o arquivo explicitamente. Precisa de algo fora do escopo? Relate no resumo final, não faça.

## Leia antes de codar (nesta ordem)

1. `D:\Github\plfcore\app\CLAUDE.md` — as regras do design system PLF (tokens, formas, tipografia, copy). São inegociáveis.
2. `D:\Github\plfcore\app\src\components\kit.css` e `src/components/*.tsx` — os primitivos já prontos. Reuse; não recrie.
3. A referência de design (arquivo do Claude Design, direção "PAINEL"): `D:\Github\plfcore\claude-design\04-resultado\PLF CORE - PAINEL.dc.html`. É HTML com estilos inline: copie medidas, cores, hierarquia e textos dele. O seu prompt diz o intervalo de linhas da sua tela (se houver). O shell (sidebar/topbar/barra inferior) já está implementado — só o miolo da tela é seu.
4. Os arquivos do seu módulo, inteiros, antes de mexer.

## Fundação já pronta (use)

- `Surface` (`src/components/Surface.tsx`): card `#181818` borda `#2B2B2B` raio 10. Cabeçalho de card = `<div className="surface-head">` (44px, fundo `#202020`, 12px 700 caps). Props legadas `cut`, `allCorners`, `brackets` NÃO existem mais no visual — remova-as das chamadas do seu módulo.
- `Button` variantes `primary` (amarelo, texto preto — uma por tela), `secondary` (cinza `#202020` borda `#3A3A3A`, é o default), `ghost`, `danger` (vermelho). Tamanhos `lg/md/sm`.
- `ScreenTitle({ kicker, title, meta, actions })`: kicker caps cinza ("SISTEMA /"), título 34px 700 branco em caixa normal ("Cockpit"), `meta` frase cinza, `actions` selos e botões à direita. Todas as telas usam.
- `.pill` (30px, pílula cinza), `.pill--value` (22px valor branco), `.chip` (20px amarelo, texto preto, contagem).
- `ProgressBar` (lisa, amarela, `hot` = vermelha). `StatusLED` (`led--live` amarelo, `led--off` cinza, `led--danger` vermelho). `ArmSwitch` (pílula com trilho; armado = vermelho). `HoldButton` (segurar 900 ms; carga preenche da esquerda).
- `KTag`/`DemoTag` (`.tag`, `.tag--demo` amarelo, `.tag--critical` vermelho, `.tag--ok`). `.checkbox` / `.checkbox--on` (16px, amarelo quando marcado, check preto). `.datarow` (linha label esquerda / valor direita, fundo `#202020`, 32px). `MetricRow`.
- `Gauge` (`showLabel={false}` quando o card já tem cabeçalho). `Modal`, `EmptyState`, `ErrorState`, `Skeleton`.
- Classes utilitárias: `.type-kicker` (11px 600 caps cinza), `.type-num` (tabular), `.type-mono` (JetBrains Mono, só telemetria bruta/log), `.type-display` (Inter 700 -0.02em, sem itálico), `.hazard-bar` (faixa amarela/preta 6px no topo de card destrutivo).
- Tokens Tailwind: `bg-void/carbon/steel/surface-2/surface-3`, `text-ink-1..4`, `border-line/edge/edge-2`, `text-signal`/`bg-signal` (amarelo = ação), `text-blood`/`border-blood` (vermelho = erro/perigo). `heat` agora é o mesmo amarelo; `rust` é vermelho escuro.

## Legado a remover do seu módulo

- Classes `hazard` (trocar por `.hazard-bar` no topo do card), `stage-grid`, `scanlines`, componente `ScanLine`, `brackets`.
- `clip-path`, chanfros, `--cut`, gradientes, `filter: drop-shadow`, `box-shadow` vermelho, `font-style: italic`, `text-transform: uppercase` em títulos de tela (botões e labels continuam caps).
- Fontes Saira/Quantico em CSS do módulo. Só `var(--font-ui)` (Inter) e `var(--font-mono)`.
- Cor de erro/perigo que usava `signal`/`heat` → agora `blood`. Cor de ação/destaque que usava `signal` → continua `signal` (amarelo). Revise caso a caso.
- Barras segmentadas próprias → `ProgressBar`.

## Regras que não mudam

- TODA string de UI no `i18n.ts` do módulo, nos 5 idiomas (pt, en, es, fr, it). Chave faltando quebra o build. Se criar chave, crie nos 5.
- Não invente dado. Campo sem fonte = `NÃO DISPONÍVEL`. Não mude lógica de negócio, stores, serviços, jobs, chamadas ao adapter. É redesign de apresentação; a funcionalidade tem que continuar idêntica (mesmos botões, mesmos fluxos, mesmas confirmações).
- Ação destrutiva = card com `.hazard-bar` + `ArmSwitch` + `HoldButton` + texto "ARME E SEGURE 0,9 S PARA CONFIRMAR" (i18n).
- Sem emoji, sem lorem ipsum, sem comentário óbvio. pt-BR com acentuação perfeita.
- Resolução alvo 1920×1080; a tela deve caber sem rolagem quando o design de referência cabe. Sem mobile.

## Verificação (obrigatória antes de dizer pronto)

- `cd D:\Github\plfcore\app; npx tsc -b` tem que passar sem erro. Rode e cole a saída.
- NÃO rode `vite build`, NÃO suba dev server, NÃO use navegador/Playwright (o dev server já roda na porta 1421 e a verificação visual é feita centralmente depois). NÃO faça commit.
- `grep -n "chamfer\|hazard \|hazard\"\|stage-grid\|scanlines\|clip-path\|cut=\|brackets\|type-display" <seus arquivos>` deve voltar só o que for intencional.

## Entrega

Resumo curto em pt-BR: arquivos alterados; o que mudou na tela (3–6 linhas); o que ficou de fora e por quê; qualquer coisa que você precisou e não podia mexer (pra eu fazer).
