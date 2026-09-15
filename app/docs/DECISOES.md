# Decisões de produto — 03/08/2026

Spec completa: prompt REDLINE (conversa de kickoff). Decisões do Gustavo por cima dela:

1. **Nome: RESYNC.** Marca centralizada em `src/brand.ts`. A metáfora do conta-giros (redline = zona vermelha do RPM) permanece como linguagem visual; o seletor global chama-se NÍVEL DE PRONTIDÃO (L5 STOCK → L1 REDLINE).
2. **i18n em 5 idiomas**: pt-BR (default), en, es, fr, it. Sistema tipado próprio (`src/i18n`), dicionário por módulo, paridade de chaves garantida em compile-time.
3. **Plataforma: Tauri 2**, instalável/executável no Windows (o usuário pediu explicitamente instalável). Toolchain Rust + MSVC instalado na máquina em 03/08/2026. UI construída web-first com adapters.
4. **Escopo v1**: todas as telas e features, de uma vez. REAL na v1 = leituras (inventário WMI, métricas ao vivo, SMART) + limpeza de temporários seguros + encerrar processos. Tweaks de Windows/latência/gargalo = DEMO com selo até a v2.
5. **Referência**: o prompt é a spec completa; sem produto externo a seguir.
