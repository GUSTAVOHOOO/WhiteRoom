# T4 Rodada 1 — Notas de Implementação e Aferição

## 1. O que foi construído

- **`src/scripts/splash/animacao.ts`**: substituiu o stub 2D pela animação 3D real usando `criarCena` da T2 e o HLR vetorial em SVG, governada por **uma única timeline GSAP determinística** (`3,10 s`), com câmera ortográfica fixa e sombra dura em dois tons acompanhando tanto a entrada das peças quanto o voo até o header.
- **`src/scripts/splash/cena/linhas/`** (`tipos.ts`, `construcao.ts`, `visibilidade.ts`, `encadear.ts`, `svg.ts`, `index.ts`):
  - Crescimento das linhas de construção a partir dos 6 asteriscos dos vértices (`0,00–0,30 s`), passando pelo pipeline completo de oclusão HLR.
  - Pulso radial das linhas de construção no impacto do quarto branco (`1,90 s`) e matriz mundo acompanhando o cubo durante o encolhimento até o header (`2,60–3,10 s`).
  - Escalonamento proporcional de espessuras de traço (`svg.ts`) e tolerâncias geométricas 2D/3D (`visibilidade.ts`, `encadear.ts`) por `escalaCubo`, evitando colapso de vértices ao encolher para `40×40 px` e preservando saída bit-a-bit idêntica à T2 quando `escalaCubo = 1`.
  - Omissão automática de malhas ocultas (`objetoVisivelNaCena`) antes do instante de entrada de cada peça, acelerando o HLR e mantendo a grade 32×32 concentrada na área visível.
- **`src/scripts/splash/cena/cubo.ts`**: expôs `luz` em `CenaCubo` para manter o frustum de sombra travado no cubo durante a entrada das peças e o encolhimento ao header sem alterar `DIRECAO_LUZ_RAW`.
- **`src/scripts/splash/contrato.ts` e `controlador.ts`**: opção `{ svgLinhas, container, dpr }` no contrato, exibição da camada `<svg data-splash-linhas>` no modo normal, ocultação no fallback e preservação integral de todas as garantias da T3 (`sessionStorage`, skip por clique/toque/Esc/Enter/Espaço, movimento reduzido, timeout 800 ms, rede 3 s, teto 8 s, `?splash=travado`; fade do fundo durante o voo mantido fora de escopo para T5).
- **`src/scripts/splash/cena/debug.ts`**: modos `/?debug=t4&t=<segundos>` (captura determinística via `seek(t)` sem HUD, `dataset.capturaPronta = '1'`) e `/?debug=t4` (loop com HUD simples de tempo/rAF/render/HLR e `window.__wrT4Bench`), mantendo `/?debug`, `/?debug=captura` e `/?debug=hlr` funcionando.
- **`tools/gauntlet/t4-rodada.mjs`**: gate completo automatizado com encerramento garantido do `astro preview` na porta `4403`, capturas desktop/mobile/pose-final, montagem da `folha-contato.png` lado a lado com o T0, benchmark de desempenho e suíte Playwright de fluxo real.

## 2. Refinamentos visuais feitos após a primeira captura da rodada 1

Na inspeção visual dos prints gerados antes de fechar a rodada 1, dois defeitos foram identificados e corrigidos imediatamente:
1. **`t-0.30s-desktop.png`**: a linha `ARESTAS_CONSTRUCAO[8]` (estendida até `T_front` na T2 para cruzar o vão superior do W) aparecia como uma haste solta apontando para o centro do hexágono vazio em `0,30 s`. O trecho interno `+X` passou a ser governado por `progressoPonteW` (= `wPosT`), deixando `0,30 s` um hexágono perfeitamente simétrico com os 6 asteriscos (como no T0) e preservando o trecho completo sobre o vão do W assim que o W entra (`0,70 s` em diante).
2. **`t-1.25s-desktop.png`**: o overshoot inicial do R com `x = -0,018` e `rSz = 0,94` fazia `meshRLamina` (`X = +0,5`) afundar na coluna do W (`X = +0,4992`), expondo a face cinza do W e atravessando seu topo branco. Ajustado para `rOvershoot = (0.008, 0.028, 0)` e squash `(1.03, 0.95, 1.0)`, cobrindo a quina em ocre limpo com impacto e rebote nítidos.

## 3. Métricas finais da rodada 1 (`metricas.json`)

- **`astro check`**: OK (`0 errors, 0 warnings, 0 hints`, `10,84 s`).
- **`astro build`**: OK (`5,50 s`).
- **Console do navegador**: `0 erros`, `0 avisos`, `0 pageErrors` em todas as capturas, benchmarks e testes.
- **Pose final (`/?debug=t4&t=2.4` em `1024×1024` dpr 1 vs `docs/gauntlet/t2/rodada-7/captura.png`)**:
  - `pixelmatch` (`threshold 0.1`): **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,3%`).
- **Alinhamento no pouso ao header (`t = 3,1 s`, desktop `1280×800`)**:
  - Retângulo `[data-splash-alvo]`: `40 × 40 px` em `(144,5; 11,5)`.
  - Logo 3D + linhas HLR: `36,24 × 40,00 px` (cubo `29,64 × 33,80 px`), erro de centro **`dx = 0,00 px, dy = 0,00 px`**.
  - Após redimensionamento da janela (`1280×800 → 900×700`): erro de centro **`dx = 0,00 px, dy = 0,00 px`**.
- **Desempenho tocando a animação inteira (`/?debug=t4`)**:
  - **Desktop `1280×800` dpr 1** (`1265×800` útil, 253 quadros): intervalo rAF médio **`13,43 ms`** (`p95 14,9 ms`), trabalho Render+HLR médio **`1,68 ms`** (`p95 4,3 ms`), HLR médio **`1,11 ms`** (`p95 3,7 ms`, meta `≤ 4 ms`).
  - **Mobile `390×844` dpr 3** (`375×844` útil, 254 quadros): intervalo rAF médio **`13,29 ms`** (`p95 14,0 ms`), trabalho Render+HLR médio **`1,49 ms`** (`p95 3,5 ms`), HLR médio **`0,94 ms`** (`p95 2,8 ms`, meta `≤ 4 ms`).
- **Testes de fluxo real em `/` (sem debug) e regressão**:
  - `fluxoNormalEReload`: OK (`3433 ms` total, logo 3D+SVG exibida, header `[data-splash-alvo]` visível `40×40` no fim, `sessionStorage = '1'`, recarga na mesma aba não reexibe splash).
  - `pularClique`: OK (`512 ms` após clique).
  - `pularEsc`: OK (`501 ms` após `Escape`).
  - `movimentoReduzido`: OK (`977 ms`, classe `splash-reduzida`).
  - `fallbackFalha`: OK (`?splash=falha`).
  - `regressaoDebugT2`: OK (`/?debug` e `/?debug=captura`).
  - `determinismoEResize`: OK (`seek(1.9)` após `seek(0.15)` e `seek(2.85)` gera `d` idêntico no contorno e construção; resize mantém `dx = 0, dy = 0`).

## 4. Artefatos gerados

- `docs/gauntlet/t4/rodada-1/folha-contato.png`
- `docs/gauntlet/t4/rodada-1/t-{0.30,0.70,1.25,1.90,2.60,3.10}s-desktop.png`
- `docs/gauntlet/t4/rodada-1/t-{1.90,2.60}s-mobile.png`
- `docs/gauntlet/t4/rodada-1/pose-final-1024.png` e `pose-final-diff.png`
- `docs/gauntlet/t4/rodada-1/metricas.json`
