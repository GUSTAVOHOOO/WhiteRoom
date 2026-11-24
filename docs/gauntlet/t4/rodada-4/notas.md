# T4 Rodada 4 — Notas: Ocultação da Logo Provisória no Modo Normal e Parada Seca sem Desencaixe de W e R

Commits de código/gate: `29afd62` (logo provisória + testes de fluxo + crítica R3) e `358d753` (parada seca de W/R + tremor rígido da cena + teste pós-impacto).

## 1. Pedido nº 1 do dono — Não mostrar a logo SVG provisória enquanto o 3D carrega

### Diagnóstico
- Em `src/components/Splash.astro`, `[data-splash-logo]` (contendo `LOGO_PROVISORIA_SVG`) iniciava visível por padrão no HTML/CSS e só recebia `logoEl.style.visibility = 'hidden'` em `src/scripts/splash/controlador.ts` quando o módulo 3D terminava de carregar.
- Como resultado, ao abrir a home no modo normal, o cubo inteiro em SVG piscava por alguns quadros antes de as linhas de construção da animação 3D começarem a crescer.

### Solução
- Em `src/styles/global.css` (carregado de forma bloqueante no `<head>` por `Base.astro`, junto das regras existentes de `#wr-splash` e `html.splash-ativa`):
  - `#wr-splash [data-splash-logo] { visibility: hidden; }` — mantém o elemento oculto desde o primeiro quadro pintado (antes de qualquer JS de módulo rodar), preservando o layout (`55vmin × 55vmin`) necessário para `calcularDeltaFlip()` no fallback.
  - `html.splash-reduzida #wr-splash [data-splash-logo] { visibility: visible; }` — mantém a logo visível desde o primeiro quadro no modo de movimento reduzido, usando a classe já aplicada sincronamente pelo script inline de `src/pages/index.astro`.
- Em `src/scripts/splash/controlador.ts`:
  - No modo fallback (timeout 800 ms, `?splash=falha`, `?splash=lento` ou pular antes do 3D), `executarFallback()` já aplica `logoEl.style.visibility = 'visible'` (inline sobrepõe o CSS) e anima o voo até o header.
  - No modo normal com 3D pronto, `logoEl.style.visibility = 'hidden'` permanece como garantia defensiva (comentário atualizado).
  - Nos modos de depuração (`/?debug`, `/?debug=captura`, `/?debug=hlr`, `/?debug=t4`), `html` recebe `splash-ativa splash-debug` (sem `splash-reduzida`), eliminando qualquer flash inicial antes de `debug.ts` aplicar `display: none`.

## 2. Pedido nº 2 do dono — W e R não podem desencaixar depois do impacto

### Diagnóstico
- Na rodada 3 (`src/scripts/splash/animacao.ts`), após encostar na quina do W em `1,22 s`, o R aplicava um rebote (`layout.rOvershoot = rInicio.normalize() * 0.0185` via `rOvT`/`rReboteT` entre `1,22` e `1,41 s`), afastando-se novamente do W (abrindo fresta visível e descolando o topo branco em `t = 1,23 s`) e alternando `malha-r-solido` ↔ `malha-r-corpo`/`malha-r-quina` durante o vai-e-volta.
- O W sofria do mesmo padrão em `0,67–0,85 s`, recuando ~15 px com `wOvershoot` e encolhendo com escala não uniforme (`wSx: 0.94, wSy: 0.96, wSz: 1.04`) após chegar na pose.

### Solução
- **Entrada monotônica com desaceleração forte e parada seca (`src/scripts/splash/animacao.ts`)**:
  - Removidos integralmente `wOvershoot`, `rOvershoot`, `wOvT`, `wReboteT`, `rOvT`, `rReboteT` e escalas por peça (`wSx/Y/Z`, `rSx/Y/Z`). `pecas.w.scale` e `pecas.r.scale` permanecem fixos em `(1, 1, 1)`.
  - **W (`0,30–0,70 s`, `duration: 0.40`, `ease: 'expo.out'`)** e **R (`0,85–1,22 s`, `duration: 0.37`, `ease: 'expo.out'`)** chegam com desaceleração forte até a pose exata (`POSICOES_FINAIS`) e travam seco sem ultrapassar nem recuar nem por 1 quadro.
- **Sensação de impacto sem desencaixe**:
  - Introduzido tremor curto e rígido da **cena inteira** (`shakeCenaX/Y`, amplitude máxima `1,89 px`, duração total `70 ms ≤ 80 ms`): em `0,70–0,77 s` (impacto W: `+1,6/+1,0` → `-0,9/-0,6` → `0/0` px) e em `1,22–1,29 s` (impacto R: `-1,6/+1,0` → `+0,9/-0,6` → `0/0` px), acompanhado de pulso radial sutil nas linhas de construção (`pulsoLinhas: 1.018`, `100 ms`).
  - Quando `shakeCenaX/Y` está ativo, `linhas.definirEstadoAnimacao` recebe `matrizConstrucao = pivoShake.matrixWorld`, movendo todas as peças já encaixadas (W, R) e todas as linhas de construção juntas como um único bloco rígido (`0,0000 px` de erro relativo R↔W mesmo no pico do tremor).
- **Troca única da malha do R**:
  - `usarRSolido = estado.rPosT < 1 - 1e-6`: como `rPosT` é estritamente monotônico `0 → 1` até `1,22 s` e constante `1` em `1,22–3,10 s`, a troca `malha-r-solido` → `malha-r-corpo` + `malha-r-quina` ocorre uma única vez no contato (`1,22 s`) e nunca volta para a malha sólida.
- **Quarto branco preservado intacto**:
  - Queda (`1,60–1,865 s`), achatamento de 7% (`sqY: 0.93`, `sqX/Z: 1.03`), tremor amortecido de 2–3 px (`shakeX/Y`, `1,865–2,025 s`) e pulso das linhas (`1.032`) mantidos exatamente como aprovados.
- **Telemetria de pose para aferição (`animacao.ts` + `cena/debug.ts`)**:
  - Exposto `obterPosePecas()` em `AnimacaoSplashControlavel` e `window.__wrT4Bench.obterPosePecas()`, projetando as posições reais de `pecas.w` e `pecas.r` pela câmera ortográfica (com e sem tremor) junto das escalas e flags de visibilidade das malhas do R.

## 3. Arquivos alterados

- `src/styles/global.css` — `#wr-splash [data-splash-logo] { visibility: hidden; }` e `html.splash-reduzida #wr-splash [data-splash-logo] { visibility: visible; }`.
- `src/scripts/splash/controlador.ts` — ajuste de comentário na linha 365 (mantendo a guarda `logoEl.style.visibility = 'hidden'`).
- `src/scripts/splash/animacao.ts` — entrada `expo.out` com parada seca para W (`0,30–0,70 s`) e R (`0,85–1,22 s`), remoção total de overshoot/rebote/escala individual, tremor rígido da cena inteira (peças + linhas, 70 ms, ≤ 1,9 px) + pulso sutil nas linhas, troca única de malha do R em `1,22 s` e `obterPosePecas()`.
- `src/scripts/splash/cena/debug.ts` — exposição de `obterPosePecas()` em `window.__wrT4Bench`.
- `tools/gauntlet/t4-rodada.mjs` — sondas Playwright via `addInitScript` + `requestAnimationFrame` para (a) logo provisória oculta no modo normal, (b) fallback (`?splash=falha`), (c) movimento reduzido (`reducedMotion: 'reduce'`), verificação de `/?debug=hlr` em `regressaoDebugT2`, e teste `estabilidadePosImpacto` amostrando W (`0,70–0,85 s`, 16 quadros a cada 10 ms) e R (`1,22–1,60 s`, 39 quadros a cada 10 ms) via `/?debug=t4&t=...`.

## 4. Resultados das verificações automáticas e métricas do gate (`metricas.json`)

- **`astro check`**: OK (`0 errors, 0 warnings, 0 hints`, `11,50 s`).
- **`astro build`**: OK (`5,31 s`).
- **Console do navegador**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Pose final (`/?debug=t4&t=2.4` em `1024×1024` dpr 1 vs `docs/gauntlet/t2/rodada-7/captura.png`)**:
  - `pixelmatch` (`threshold 0.1`): **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,3%`).
- **Alinhamento no pouso ao header (`t = 3,1 s`, desktop `1280×800`)**:
  - `36,24 × 40,00 px` no alvo `40 × 40 px`, erro de centro **`dx = 0,00 px, dy = 0,00 px`**.
- **Desempenho (`/?debug=t4`)**:
  - **Desktop `1280×800` dpr 1** (249/250 quadros): rAF médio **`13,469 ms`** (`p95 14,7`), trabalho Render+HLR médio **`1,824 ms`** (`p95 4,5`), HLR médio **`1,200 ms`** (`p95 3,6`, meta `≤ 4 ms`).
  - **Mobile `390×844` dpr 3** (249/250 quadros): rAF médio **`13,314 ms`** (`p95 14,6`), trabalho Render+HLR médio **`1,858 ms`** (`p95 4,4`), HLR médio **`1,187 ms`** (`p95 3,6`, meta `≤ 4 ms`).
- **Testes de fluxo real em `/` e regressão**: **8/8 OK**:
  - **(a) Modo normal (`fluxoNormalEReload`)**: OK (`3448 ms`) — `254` quadros rAF amostrados (`5` antes do 3D iniciar), **`0` quadros visíveis antes do 3D** e **`0` no total** (`primeiraAmostra`: `visibility: "hidden"`, `visivel: false`); reload na mesma aba sem splash.
  - **(b) Fallback (`fallbackFalha`, `?splash=falha`)**: OK — `38/40` quadros visíveis, logo voou do centro `(632.5, 400)` (`440 px`) até o header `(164.5, 31.5)` (`40 px`), deslocamento `595,66 px`, distância final ao alvo `0,00 px`.
  - **(c) Movimento reduzido (`movimentoReduzido`, `reducedMotion: 'reduce'`)**: OK (`966 ms`) — `71/71` quadros visíveis desde o início (`visivelDesdeInicio: true`), completamente parada (`maxDeslocamentoPx: 0`, `maxVariacaoLarguraPx: 0`), fade completo (`overlayOpacity: 1 → 0`) e remoção do overlay.
  - **`pularClique`** (`505 ms`), **`pularEsc`** (`504 ms`), **`regressaoDebugT2`** (`/?debug`, `/?debug=hlr`, `/?debug=captura` OK), **`determinismoEResize`** (`dx = 0, dy = 0` OK).
  - **`estabilidadePosImpacto`**: OK (tolerância `0,5 px`):
    - **W (`0,70–0,85 s`, 16 amostras a cada 10 ms)**: `maxErroProjSemTremorPx = 0`, `maxDesvioEscala = 0`, `maxTremorCenaPx = 1,887 px`, `tremorForaJanela80ms = 0`, `linhasSemTremorCena = 0`.
    - **R (`1,22–1,60 s`, 39 amostras a cada 10 ms)**: `malhaSolidoAntesContato = true` (`1,21 s`), `quadrosMalhaSolidoPosContato = 0`, `quadrosMalhaEncaixeAusente = 0`, `maxErroProjSemTremorPx = 0`, `maxErroRelativoRWComTremorPx = 0`, `maxDesvioEscala = 0`, `maxTremorCenaPx = 1,887 px`, `tremorForaJanela80ms = 0`, `linhasSemTremorCena = 0`.
- **Processos**: porta `4403` liberada automaticamente pelo gate; `astro dev` da porta `4405` mantido intocado.

## 5. Artefatos gerados

- `docs/gauntlet/t4/rodada-4/impacto-antes-depois.png` (recortes 3× nearest-neighbor do W em `0,69 · 0,72 · 0,76 s` e do R em `1,21 · 1,23 · 1,26 · 1,30 s`, Rodada 3 ANTES vs. Rodada 4 DEPOIS).
- `docs/gauntlet/t4/rodada-4/folha-contato.png`
- `docs/gauntlet/t4/rodada-4/t-{0.30,0.55,0.66,0.70,1.05,1.15,1.21,1.25,1.30,1.90,2.60,3.10}s-desktop.png`
- `docs/gauntlet/t4/rodada-4/t-{1.90,2.60}s-mobile.png`
- `docs/gauntlet/t4/rodada-4/pose-final-1024.png` e `pose-final-diff.png`
- `docs/gauntlet/t4/rodada-4/metricas.json`
