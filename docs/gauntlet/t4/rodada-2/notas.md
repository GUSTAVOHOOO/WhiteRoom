# T4 Rodada 2 — Notas de Correção da Falha nº 1 (Oclusão das Linhas de Construção)

Commit de código/gate: `1848214`.

## 1. Diagnóstico da falha nº 1

Na rodada 1, `MotorVisibilidadeHlr` (`src/scripts/splash/cena/linhas/visibilidade.ts`) aplicava o mesmo teste de profundidade 3D ortográfica (`zTri < mz - epsOclusaoNdc`) tanto para arestas de contorno quanto para arestas de construção (`ehConstrucao`). Como as 12 linhas de construção representam arestas 3D fixas do cubo de referência `[-0,5, +0,5]³` (e seus prolongamentos externos até `±0,723` e pulso radial `1,032`), sempre que uma peça ficava deslocada ou achatada atrás dessas arestas em profundidade 3D, a linha `#A8A8A4` aparecia **por cima das faces sólidas**:

1. **`t-0.70s-desktop.png` (impacto/overshoot do W)**: o vetor `wOvershoot` desloca o W no plano da câmera (`+camRight, +camUp`), reduzindo `Z_mundo` da face frontal preta de `+0,5` para `≈ +0,467`. Com isso, a aresta `ARESTAS_CONSTRUCAO[8]` (`Y = +0,5, Z = +0,5`) ficava à frente do W em 3D e atravessava a face frontal preta (e o chanfro lateral interno) das duas hastes do W (`~x 457–502, y 292–314` e `~x 604–648, y 372–394`).
2. **`t-1.90s-desktop.png` e `t-1.90s-mobile.png` (impacto/achatamento do quarto)**: `pivoSquash` comprime o topo do cubo para `Y = +0,43` enquanto `pulsoLinhas = 1,032` expande as linhas de construção para `Y = +0,516, Z = +0,516` e `pivoShake` desloca o cubo `(+2,5; -3,0)` px. Assim, a ponte frontal (`T_left → T_front`) atravessava os topos brancos esquerdo e direito do W/quarto, e a aresta vertical direita (`X = +0,516, Z = -0,516`) cortava a ponta direita do topo branco do R/quarto.
3. **Peças em movimento durante a entrada**: os prolongamentos externos dos asteriscos (`B_left +Z` até `Z = +0,723`, `B_right +X` até `X = +0,723`) também possuem profundidade mais próxima da câmera que as faces frontais de W e R em aproximação, podendo riscar as peças ao cruzar os cantos.

## 2. Regra adotada e justificativa

Separamos explicitamente as linhas de construção em **arestas externas/silhueta** vs. a **ponte interna sobre o vão aberto do W**, e pré-classificamos uma única vez na inicialização (`arestas.ts`, custo zero por quadro) cada triângulo frontal em três papéis (`PAPEL_OCLUSAO_CONSTRUCAO` em `tipos.ts`):

1. **Separação da ponte do W (`construcao.ts`)**: a antiga `ARESTAS_CONSTRUCAO[8]` foi dividida em:
   - Haste externa do asterisco `T_left -X` (`X: -0,5 - EXT → -0,5`, `ehPonteW: false`);
   - Ponte interna sobre o vão superior do W (`X: -0,5 → +0,5`, `ehPonteW: true`, crescendo por `progressoPonteW`).
2. **Oclusão 2D incondicional para todas as linhas externas/silhueta (`ehConstrucao && !ehPonteW`)**: qualquer triângulo frontal não mascarado (`direitaR`) de qualquer peça que cubra o ponto médio `(mx, my)` em 2D oculta a linha, **independentemente da profundidade Z**. Na pose final, nenhuma dessas 12 arestas externas cruza o interior de qualquer face sólida — todas ficam fora da silhueta, nos vãos abertos inferiores/laterais ou coincidentes com contornos pretos já subtraídos por `subtrairCoincidentesComContorno`.
3. **Regra para a ponte sobre o vão aberto do W (`ehPonteW`)**:
   - **`SOLIDO` (0)** — todas as faces de R (`malha-r-*`), todos os topos brancos e peitoris (`ny > 0,5`), a face frontal preta do W (`nz > 0,5`), a face externa direita do W e as inclinações do V do W: **ocluem `ehPonteW` em 2D incondicionalmente**. Isso elimina integralmente as linhas sobre a face preta do W em `0,70 s` e sobre todos os topos brancos em `1,90 s` (desktop e mobile).
   - **`PAREDE_INTERNA_QUARTO` (1)** — faces verticais internas de `malha-fundo-esquerda` (`nx > 0,95 || nz > 0,95`, cobrindo a parede interna `X = -0,365`, o batente recuado da porta `Z ≈ -0,105` e a tampa oculta em `Z = +0,365` atrás do W) e de `malha-fundo-direita` (`nz > 0,95` ou `nx > 0,95 && cx < 0,45`): para `ehPonteW`, mantêm o **teste de profundidade 3D normal**, preservando a linha visível sobre a parede interna do fundo e sobre o vão da porta através do vão aberto do W (inclusive durante o achatamento em `1,90 s` e na pose final aprovada).
   - **`CHANFRO_INTERNO_W` (2)** — face lateral interna vertical da haste esquerda do W (`malha-w`, `nx > 0,95 && cx < 0`, `X ≈ -0,2775`): usa profundidade 3D para `ehPonteW` **somente quando a quina superior frontal dessa haste `(-0,2775; +0,5; +0,5)` coincide geometricamente com a ponte de construção** (`wPonteAlinhada`, tolerância `0,004 × escalaCubo ≈ 1,5 px`). Assim:
     - Na pose encaixada (`1,25 s`, `2,40 s`, `2,60 s`, voo até o header e modo estático T2), a ponte parte continuamente da quina superior frontal da haste esquerda do W cruzando o chanfro cinza recuado — garantindo **`0,0000%` de diff (`0 / 1.048.576 px`)** contra `docs/gauntlet/t2/rodada-7/captura.png`.
     - Durante o overshoot/movimento do W (`0,70 s`, `0,66 s`), `wPonteAlinhada` é `false` e o chanfro cinza também oclui em 2D, evitando um risco cinza solto surgindo abaixo do topo da haste.

> **Nota sobre o ajuste fino de `malha-fundo-esquerda`**: inicialmente a tampa oculta em `Z = +0,365` havia sido classificada como `SOLIDO`, o que produziu `4 px` (`0,0004%`) de diferença na pose final porque ela se projeta 6 px à direita da quina frontal do W sob o chanfro cinza. Como `Z = +0,365` fica estritamente atrás de `Z = +0,5` (e atrás da face preta do W), incluí-la na regra `nx > 0,95 || nz > 0,95` (ainda com `ny > 0,5` sempre `SOLIDO`) zerou a diferença para **`0 / 1.048.576 px`**.

## 3. Arquivos alterados

- `src/scripts/splash/cena/linhas/tipos.ts` — constante `PAPEL_OCLUSAO_CONSTRUCAO` e campo `trisPapelConstrucao` em `DadosMalhaHlr`.
- `src/scripts/splash/cena/linhas/arestas.ts` — classificação estática `classificarPapelConstrucao` executada uma única vez na extração das malhas.
- `src/scripts/splash/cena/linhas/construcao.ts` — flag `ehPonteW` separando a haste externa `T_left -X` da ponte interna sobre o vão do W.
- `src/scripts/splash/cena/linhas/visibilidade.ts` — checagem geométrica `wPonteAlinhada` (O(1) por quadro) e oclusão 2D/3D seletiva em `pontoOcluido`.
- `tools/gauntlet/t4-rodada.mjs` — capturas extras em `0,55 s` e `1,05 s` (exigidas no gate) + `0,66 s` e `1,21 s` (instantes em que o `power4.in` efetivamente coloca W e R cruzando as arestas inferiores de construção), todas incluídas na `folha-contato.png`.

Perfis SVG, geometria, cores das faces, luz, estilo das linhas e `animacao.ts` permaneceram **intactos**.

## 4. Verificação de peças em movimento e efeito sobre falhas 2 e 3

- **Capturas em movimento**: em `0,55 s` e `1,05 s` (curva `power4.in`), W e R ainda estão entrando fora do hexágono central; por isso o gate também captura **`0,66 s`** (W sobrepondo o asterisco e as arestas inferiores esquerdas) e **`1,21 s`** (R sobrepondo o asterisco e as arestas inferiores direitas, inclusive com a linha vertical direita aparecendo limpa pelo furo interno do R). Também verificamos localmente `1,835 s` e `1,855 s` (queda do quarto branco cruzando as arestas superiores): em todos os casos, **nenhuma linha de construção atravessa face sólida**.
- **Falhas nº 2 e nº 3 da crítica da rodada 1**: mantidas intencionalmente fora de escopo nesta rodada; nenhuma delas se resolveu como efeito colateral — seguem intactas para as próximas rodadas (pouso no header em `3,10 s` e encaixe/overshoot de W e R em `0,70 s` / `1,25 s`).

## 5. Métricas finais da rodada 2 (`metricas.json`)

- **`astro check`**: OK (`0 errors, 0 warnings, 0 hints`, `10,89 s`).
- **`astro build`**: OK (`5,23 s`).
- **Console do navegador**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Pose final (`/?debug=t4&t=2.4` em `1024×1024` dpr 1 vs `docs/gauntlet/t2/rodada-7/captura.png`)**:
  - `pixelmatch` (`threshold 0.1`): **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,3%`).
- **Alinhamento no pouso ao header (`t = 3,1 s`, desktop `1280×800`)**:
  - `36,24 × 40,00 px` no alvo `40 × 40 px`, erro de centro **`dx = 0,00 px, dy = 0,00 px`**.
- **Desempenho (`/?debug=t4`)**:
  - **Desktop `1280×800` dpr 1** (250 quadros): rAF médio **`13,469 ms`** (`p95 14,5`), trabalho Render+HLR médio **`1,520 ms`** (`p95 3,9`), HLR médio **`0,982 ms`** (`p95 3,2`, meta `≤ 4 ms`).
  - **Mobile `390×844` dpr 3** (254 quadros): rAF médio **`13,282 ms`** (`p95 14,5`), trabalho Render+HLR médio **`1,602 ms`** (`p95 4,0`), HLR médio **`1,012 ms`** (`p95 3,1`, meta `≤ 4 ms`).
- **Testes de fluxo real em `/` e regressão**: **7/7 OK** (`fluxoNormalEReload` 3440 ms, `pularClique` 505 ms, `pularEsc` 503 ms, `movimentoReduzido` 966 ms, `fallbackFalha`, `regressaoDebugT2`, `determinismoEResize`).
- **Processos**: conferido após o gate — nenhum `astro preview` / `astro dev` ativo na porta `4403` ou em segundo plano.

## 6. Artefatos gerados

- `docs/gauntlet/t4/rodada-2/linhas-antes-depois.png` (recortes 3× nearest-neighbor das 5 regiões citadas na crítica: `t-0.70s-desktop`, `t-1.90s-desktop` esquerdo/centro e direito, `t-1.90s-mobile` esquerdo/centro e direito — Rodada 1 antes vs. Rodada 2 depois).
- `docs/gauntlet/t4/rodada-2/folha-contato.png` (inclui as 6 comparações T4×T0, `0,55 s`, `1,05 s`, `0,66 s`, `1,21 s` e mobile `1,90 s` / `2,60 s`).
- `docs/gauntlet/t4/rodada-2/t-{0.30,0.55,0.66,0.70,1.05,1.21,1.25,1.90,2.60,3.10}s-desktop.png`
- `docs/gauntlet/t4/rodada-2/t-{1.90,2.60}s-mobile.png`
- `docs/gauntlet/t4/rodada-2/pose-final-1024.png` e `pose-final-diff.png`
- `docs/gauntlet/t4/rodada-2/metricas.json`
