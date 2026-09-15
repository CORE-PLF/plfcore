# Prompt pro Claude Design — redesign do RESYNC → PLF CORE

Cola o texto abaixo (da linha "---" em diante) no Claude Design. Anexa **todas** as imagens da pasta
`01-fotos/` e o `03-app.zip` (ou a pasta `03-app/`).

---

## Contexto

Estou redesenhando um app desktop pra Windows chamado **RESYNC** (diagnóstico e otimização de PC pra
gamers de FiveM/GTA). Ele vai virar **PLF CORE**, o app oficial do servidor **PLF / Pro League**. O
código do front está no zip anexo (React 19 + TypeScript + Tailwind 4 + Vite; roda dentro de Tauri 2).
Os tokens de design atuais estão em `src/styles/index.css` (bloco `@theme`), os componentes base em
`src/components/`, o shell (sidebar, topbar, barra inferior, tela de boot) em `src/shell/` e cada tela
em `src/modules/<nome>/`.

As imagens `resync-atual-*.png` mostram como o app é hoje: estética "cockpit de máquina", preto +
vermelho, chanfros de 45°, fontes Saira Condensed itálica / Quantico / JetBrains Mono, barras
segmentadas, grain e scanlines.

As imagens `plf-*.png` são frames do Figma da UI in-game do servidor PLF (a linguagem visual que eu
quero adotar). As imagens `logo-*.png` são a marca.

## O que eu quero

**Três direções de design diferentes** pro mesmo app, na linguagem visual do PLF, mantendo a
estrutura e as funções que já existem. Não é reskin de cor: é trocar a gramática visual inteira
(forma, tipografia, superfícies, componentes), mas sem inventar telas nem funções novas. Eu vou
escolher uma das três e depois pedir o restante das telas nela.

As três precisam ser **claramente distintas entre si** (layout, hierarquia, densidade, uso do
amarelo), não três variações da mesma tela. Cada uma num artboard/grupo separado, com nome.

### Direção A — "ARENA" (a mais fiel ao Figma in-game)

- Sai a sidebar. Entra um **header horizontal** como o do lobby (`plf-08-lobby-header.png`): logo à
  esquerda, os módulos como tabs em pílula no centro, status/nível/licença em pílulas à direita.
  Módulos secundários (Requisitos, Ajustes, Inicialização, Latência, Gargalo) ficam num dropdown
  como o "Personalização".
- Conteúdo em **painéis flutuantes** centralizados sobre o fundo preto, com cabeçalho de painel
  (ícone + título + botão fechar circular), busca e filtros em pílula como no Gerenciador de Temas
  (`plf-01`, `plf-02`).
- Amarelo generoso: tab ativa, CTA, badges, barras. É a direção mais "jogo".

### Direção B — "PAINEL" (dashboard profissional)

- **Sidebar mantida**, mas redesenhada: logo no topo, itens em linhas com ícone fino, item ativo com
  fundo `#202020` e barra amarela de 3 px à esquerda. Rodapé com Configurações e Log.
- Densidade alta: cards em grade com superfícies em camadas (`#181818` → `#202020` → `#282828`),
  padrão "label pequeno em cinza / valor grande em branco" (`plf-13-ranking.png`, `plf-12-placar.png`).
- Amarelo **contido**: só em ação primária, LED de status e preenchimento de barra. Tudo o mais é
  escala de cinza. É a direção mais sóbria e mais "ferramenta".

### Direção C — "LOADSCREEN" (editorial, dramática)

- Inspirada em `plf-07-loadscreen.png` e `plf-19-tempo-espera.png`: muito preto, **tipografia grande**,
  logo com presença, hexágonos como moldura de números-chave (uso de CPU, pacotes prontos, % da limpeza).
- Navegação numa **coluna esquerda estreita só com ícones** (labels aparecem no hover); painel
  lateral direito com bordas amarelas finas e cantos cortados como o "RANKING / DOMINAÇÃO" da loadscreen
  pra kill feed e telemetria.
- Cada tela tem um elemento gigante no centro (o gauge, o número "5 PRONTOS", o disco) e o resto
  respira em volta. Amarelo em traços e contornos, não em blocos sólidos. É a direção mais "marca".

### Linguagem visual do PLF (extraída dos frames)

- **Fundo** preto `#101010`. Superfícies em camadas: `#181818` → `#202020` → `#282828`. Bordas de 1 px
  sutis (`#2B2B2B`). Sem gradiente colorido, sem grain, sem scanlines, sem chanfro.
- **Acento amarelo `#F8E800`** (ajuste fino se precisar): é a cor de ação. Botão primário = fundo
  amarelo com texto **preto**. Tab ativa, badge "ativo/equipado", item de menu selecionado, ícone de
  moeda, barra de progresso: amarelo. Glow amarelo só em hover de CTA e no LED de status.
- **Marca**: PRO LEAGUE em branco/prata com a mira **vermelha** no "O" (ver `logo-*.png`). Vermelho
  fica reservado pra marca e pra erro/zona de perigo. O amarelo é da UI, não da marca.
- **Forma**: cantos arredondados — ~10 px em cards e painéis, ~6 px em inputs e botões, 999 px em
  pílulas e badges. Botão de fechar circular. Hexágono como moldura de nível/número grande
  (ver `plf-07-loadscreen.png`, o "81%").
- **Tipografia**: sans neutra (Inter ou equivalente), pesos 500/600/700, caixa normal. Títulos de
  seção pequenos em cinza com o valor grande em branco embaixo (padrão "RANKING / DOMINAÇÃO"). Números
  de telemetria continuam em mono tabular (JetBrains Mono) — é a única exceção.
- **Componentes recorrentes no Figma que eu quero reaproveitar**: header com logo à esquerda + tabs
  no centro + pílulas de status à direita; card com faixa de cabeçalho; badges de estado
  (`Equipado` amarelo / `Não equipado` cinza / `Bloqueado` cinza escuro); campo de busca com ícone;
  filtros em pílula (`Todos / Desbloqueados / Bloqueados`); dica "Use o scroll para baixo"; lista
  ranqueada com posição em pílula (`plf-13-ranking.png`); barra de progresso lisa amarela com
  porcentagem ao lado; painel lateral direito com cabeçalho ícone + label (`plf-07-loadscreen.png`).

### O que manter do RESYNC

- **Conteúdo e navegação**: os mesmos 12 módulos (Cockpit, FPS Booster, Raio-X, Memória, Limpeza,
  Windows, FiveM, Requisitos, Ajustes, Inicialização, Latência, Gargalo) + Configurações e Log; o
  título da tela, o status "SISTEMA // PRONTO" e o estado da barra inferior (`IDLE`) precisam existir
  em algum lugar em cada direção. Cada tela tem UM elemento dominante (gauges no cockpit, o botão
  grande no FPS Booster, a ilustração do disco na Limpeza).
- **Gauges** do cockpit (agulha, arco, zona vermelha) — recolorir: arco cinza, preenchimento amarelo,
  zona de perigo vermelha, agulha branca.
- **Kill feed** (log de ações no canto), **selo "MODO DE DEMONSTRAÇÃO"**, **botão PROVA REAL**,
  **nível de prontidão (L1..L5)** no topo.
- **Honestidade**: nada de número inventado; estados nunca só por cor (sucesso = branco + check,
  erro = vermelho + ícone, aviso = laranja + ícone). Sem emoji. Copy curta, técnica, imperativa,
  em pt-BR ("LIMPAR", "ATIVAR", "APLICAR").
- **Ações destrutivas** têm switch ARMAR + botão de segurar 900 ms (hold-to-confirm) — redesenhe,
  não remova.
- Resolução fixa desktop **1920×1080**, sem mobile.

### Telas pra entregar — as mesmas 4 em cada direção (12 artboards, 1920×1080)

1. **Cockpit** (`resync-atual-01-cockpit.png`): shell completo (navegação, título, status, kill
   feed, barra inferior) + 3 gauges CPU/GPU/RAM + telemetria de 60 s. É a tela que mostra a direção.
2. **FPS Booster** (`resync-atual-02-fpsboost.png`): CTA dominante, lista do que vai ser aplicado
   com estado ligado/desligado, barra "ligando 11 de 16".
3. **Limpeza** (`resync-atual-03-limpeza.png`): ilustração do disco, categorias, zona destrutiva
   com switch ARMAR + botão de segurar.
4. **Ativação de licença** (não tem print; código em `src/modules/license/LicenseGate.tsx`): tela
   cheia antes do app abrir, logo grande, campo pra colar a chave `PLF-XXXX-XXXX-XXXX-XXXX`, botões
   `ATIVAR` (primário) e `COMPRAR` (secundário, abre a loja), um exemplo de erro visível
   (chave já usada em outra instalação).

Depois que eu escolher a direção, vou pedir na mesma conversa: Raio-X, FiveM, Memória, Windows,
Requisitos, Ajustes, Inicialização, Latência, Gargalo, Configurações, Log e a Ignição (boot).

### Formato da entrega

- Os 12 artboards agrupados por direção (A / B / C), cada grupo com nome e 3 linhas dizendo a ideia.
- Pra cada direção, um **resumo de tokens** (cores, raios, tipografia, espaçamento) — não precisa ser
  completo agora; o sistema completo em CSS custom properties compatível com o bloco `@theme` do
  Tailwind 4 (`src/styles/index.css`) eu peço pra direção escolhida.
- Fiel o bastante pra um dev portar direto pro React/Tailwind do zip: mesmos textos, mesmos dados
  (30 %, 17 %, 43 %, "5 prontos para ligar", etc.), sem lorem ipsum.
- Uma nota curta por direção: o que mudou em relação ao RESYNC e por quê.

### O que NÃO fazer

- Não criar telas ou funções que não existem no código.
- Não usar roxo, azul, verde, teal ou rosa como cor de UI (no Figma essas cores só aparecem em
  variantes de "tema" de card e raridade de item — não são UI).
- Não usar glassmorphism, blur, gradiente colorido, emoji, ícone genérico de biblioteca com traço
  grosso. Ícones finos, monocromáticos, 1,5 px.
- Não misturar com o visual antigo (chanfro, itálico condensado, stripes).
