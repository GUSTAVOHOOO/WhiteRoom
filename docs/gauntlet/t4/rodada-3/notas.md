# T4 Rodada 3 — Notas de Correção da Falha nº 1 (R Íntegro em Voo e Rebote Diagonal no Impacto)

Commit de código/gate: `f3fb93c`.

## 1. Diagnóstico da falha nº 1

A falha nº 1 da crítica da rodada 2 (`docs/gauntlet/t4/rodada-2/critica.md`) tinha duas causas combinadas originadas do remendo de quina feito na T2 para a **pose parada** (`docs/gauntlet/t2/estado.md` §3):

1. **R recortado/chanfrado em voo (`t-1.21s-desktop.png`, `~x 742–765, y 458–485`)**:
   - Para evitar z-fighting com a coluna frontal direita do W (`X ∈ [+0,365, +0,4992], Z ∈ [+0,365, +0,5]`) quando as duas peças estão encaixadas, `pecas.ts` recuava o corpo do R (`malha-r-corpo`) para `Z ≤ +0,365` e tampava a face frontal ocre (`X = +0,5, Z ∈ [+0,365, +0,5]`) com uma `BoxGeometry` finíssima de espessura `0,0006` (`malha-r-quina`).
   - Quando o R voava sozinho no ar, a ausência de volume e de topo branco em `Z ∈ [+0,365, +0,5]` deixava exposta a face de corte `+Z` (`Z = +0,365`, `#EBEAE6`) por trás da borda superior da lâmina fina, criando um canto chanfrado com um triângulo cinza-claro e um traço preto diagonal atravessando o topo branco.
2. **Impacto verticalizado erguendo os pés e expondo o W (`t-1.25s-desktop.png`, `~x 634–662, y 375–398` e `~x 634–818, y 596–613`)**:
   - Na rodada 2, o impacto do R usava `rOvershoot = (0.008, 0.028, 0)` somado a `rSy = 0.95` aplicado em torno do pivô central `Y = 0` (`POSICOES_FINAIS.r`), além de `back.out(2.8)` no retorno (`1,25–1,41 s`).
   - Os dois efeitos se cancelavam no topo (`Y_max = +0,5 × 0,95 + 0,028 = +0,503`, quase parado) e se somavam na base (`Y_min = -0,5 × 0,95 + 0,028 = -0,447`), erguendo os pés `0,053 u ≈ 11 px` acima da pose (`y = 596` vs. `607`) e expondo a lateral cinza `+X` do W sob o pé esquerdo. Além disso, o topo elevado (`+0,503`) com `rSx = 1,03` deslocava o recorte de `Z = +0,365` acima do topo branco do W, desenhando uma linha preta sobre a haste direita do W.

## 2. Solução escolhida e justificativa

Optamos por **alternar dinamicamente entre a malha sólida íntegra e a malha com encaixe de quina** conforme a distância à pose encaixada, combinado a um **rebote seco contido ao longo da trajetória de entrada**:

1. **Malha sólida íntegra `malha-r-solido` para voo e rebote (`src/scripts/splash/cena/pecas.ts`)**:
   - Adicionamos `geomRSolido` (`SEGMENTOS_CURVA_R = 64`) e `geomRSolidoHlr` (`SEGMENTOS_CURVA_R_HLR = 32`) com exatamente a mesma extrusão, profundidades de furo/perna e material `matR` de `geomRCorpo`, porém **sem** `limitarEixoGeometria(..., 'z', 'max', BORDA_INTERNA)`.
   - Assim, o bloco do R mantém `Z ∈ [-0,5, +0,5]` completo, topo branco contínuo até a quina frontal e espessura lateral esquerda `+Z` (`#EBEAE6`) perfeitamente plana e manifold — 100% simétrico ao volume do W em voo.
   - `meshRSolido.visible` inicia como `false` (e `meshRCorpo`/`meshRLamina` como `true`): na T2 (`/?debug`, `/?debug=captura`, `/?debug=hlr`) e na pose final (`t ≥ 1,41 s`, incluindo `1,90 s`, `2,40 s`, `2,60 s`, `3,10 s`), a geometria ativa e a ordem de malhas no HLR são **bit-a-bit idênticas à T2** (custo zero por quadro quando oculta, pois `MotorVisibilidadeHlr` pula malhas invisíveis e o cache de visibilidade em `linhas/index.ts` detecta a troca automaticamente).
2. **Alternância automática por distância (`src/scripts/splash/animacao.ts`)**:
   - Em `aplicarEstado()`, `usarRSolido = Math.hypot(rxOff, ryOff, rzOff) > 1e-4 || |rSx-1|+|rSy-1|+|rSz-1| > 1e-4`.
   - Sempre que o R está em voo (`0,85–1,22 s`) ou em rebote (`1,22–1,41 s`), exibe `malha-r-solido` (+ `malha-r-topo-continuo`) e oculta `malha-r-corpo` e `malha-r-quina`. No instante em que encaixa no W (`d ≤ 1e-4`), volta para `malha-r-corpo` + `malha-r-quina` sem salto visual.
3. **Rebote seco ao longo da trajetória de entrada (`src/scripts/splash/animacao.ts`)**:
   - Como o W já está parado na quina frontal (`X ≤ +0,4992, Y ∈ [-0,5, +0,5], Z ∈ [+0,365, +0,5]`), qualquer deslocamento do R para cima-esquerda (`-rInicio.normalize()`) obrigatoriamente ergue `Y_min > -0,5` (expondo a face cinza do W sob o pé esquerdo) e afunda `X < +0,4992` atrás da lateral do W.
   - Por isso, ao colidir seco no W em `1,22 s` (`power4.in`), o R realiza um **quique elástico para trás ao longo da mesma reta de entrada** (`+rInicio.normalize()`, direção baixo-direita) com amplitude contida de **`0,0185 u`** (`~4,9 px` em `1280×800`: `+3,75 px` horizontal, `+3,14 px` vertical para baixo), atingindo o pico em `1,25 s` (`power2.out`) e retornando de forma monotônica (`power3.out`, `1,25–1,41 s`) para travar firme em `(0, 0, 0)` sem ultrapassar o W nem comprimir os pés para cima.
   - A amplitude `0,0185 u` foi calibrada de modo que o deslocamento horizontal na tela (`3,75 px`) fique logo abaixo da largura do traço de contorno em `1280×800` (`4,30 px`), eliminando qualquer micro-fresta vertical dupla na quina e mantendo `0` pixels da lateral cinza do W expostos (nem sob o pé esquerdo, nem na emenda superior), enquanto o deslocamento diagonal de `~5 px` fica claramente legível no topo direito, na curva e nos pés.
   - **Invariância em retrato extremo (mobile `390×844`)**: quando a razão altura/largura ultrapassa `~1,82`, `rInicio.z` tornaria-se ligeiramente positivo. Em `recalcularLayout()`, compensamos ao longo de `-camBack` (direção perpendicular ao plano da tela, portanto **invisível na projeção ortográfica**) garantindo `rOvershoot.z ≤ -0,003` e `rInicio.z ≤ -0,25` em qualquer viewport, mantendo o R sempre atrás da face frontal preta do W (`Z = +0,5`) durante a aproximação e o rebote.

## 3. Arquivos alterados

- `src/scripts/splash/cena/pecas.ts` — adição de `geomRSolido`, `geomRSolidoHlr` e `malha-r-solido` (`visible = false` por padrão), descartadas corretamente em `descartaveis.geometrias`.
- `src/scripts/splash/animacao.ts` — alternância `malha-r-solido` ↔ (`malha-r-corpo` + `malha-r-quina`) por distância, rebote diagonal contido (`0,0185 u`) ao longo da trajetória de entrada com retorno monotônico `power3.out` (`1,25–1,41 s`) e guarda ortográfica de profundidade `Z` em retrato.
- `tools/gauntlet/t4-rodada.mjs` — inclusão das capturas desktop em `1,15 s` (`t-1.15s-desktop.png`) e `1,30 s` (`t-1.30s-desktop.png`) no gate e na `folha-contato.png`.

Perfis SVG, geometria da pose final, cores das faces, luz, estilo das linhas e o módulo HLR (`src/scripts/splash/cena/linhas/*`) permaneceram **intactos**.

## 4. Efeito sobre as falhas nº 2 e nº 3 da rodada 2

- **Falha nº 2** (linha de construção interna `progressoPonteW` crescendo após `0,30 s` em `0,55 s` / `0,66 s`): mantida fora de escopo nesta rodada; inalterada.
- **Falha nº 3** (entrada tardia de W e R em `0,55 s` / `1,05 s` pela curva `power4.in`, refletida também em `1,15 s`, onde apenas a ponta da barra superior do R cruza a borda inferior direita, e rebote assimétrico do W em `0,70 s`): mantida fora de escopo. Como efeito colateral positivo, o rebote do R em `1,25 s` já está contido em `~4,9 px` ao longo da trajetória de entrada (alinhado à meta de `~5–7 px`), preparando o terreno para unificar a curva de entrada e o rebote do W na próxima rodada.

## 5. Métricas finais da rodada 3 (`metricas.json`)

- **`astro check`**: OK (`0 errors, 0 warnings, 0 hints`, `10,62 s`).
- **`astro build`**: OK (`4,94 s`).
- **Console do navegador**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Pose final (`/?debug=t4&t=2.4` em `1024×1024` dpr 1 vs `docs/gauntlet/t2/rodada-7/captura.png`)**:
  - `pixelmatch` (`threshold 0.1`): **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,3%`).
- **Alinhamento no pouso ao header (`t = 3,1 s`, desktop `1280×800`)**:
  - `36,24 × 40,00 px` no alvo `40 × 40 px`, erro de centro **`dx = 0,00 px, dy = 0,00 px`**.
- **Desempenho (`/?debug=t4`)**:
  - **Desktop `1280×800` dpr 1** (250 quadros): rAF médio **`13,430 ms`** (`p95 14,2`), trabalho Render+HLR médio **`1,570 ms`** (`p95 3,8`), HLR médio **`1,028 ms`** (`p95 3,1`, meta `≤ 4 ms`).
  - **Mobile `390×844` dpr 3** (253 quadros): rAF médio **`13,266 ms`** (`p95 14,1`), trabalho Render+HLR médio **`1,472 ms`** (`p95 3,6`), HLR médio **`0,964 ms`** (`p95 2,9`, meta `≤ 4 ms`).
- **Testes de fluxo real em `/` e regressão**: **7/7 OK** (`fluxoNormalEReload` 3427 ms, `pularClique` 511 ms, `pularEsc` 501 ms, `movimentoReduzido` 963 ms, `fallbackFalha`, `regressaoDebugT2`, `determinismoEResize`).
- **Processos**: porta `4403` livre e nenhum servidor ativo após o término do gate.

## 6. Artefatos gerados

- `docs/gauntlet/t4/rodada-3/r-antes-depois.png` (recortes ampliados 3× nearest-neighbor do R em `1,15 · 1,21 · 1,25 · 1,30 s`, Rodada 2 antes vs. Rodada 3 depois).
- `docs/gauntlet/t4/rodada-3/folha-contato.png` (6 comparações T4×T0 + 6 quadros de movimento `0,55 / 1,05 / 0,66 / 1,15 / 1,21 / 1,30 s` + mobile `1,90 / 2,60 s`).
- `docs/gauntlet/t4/rodada-3/t-{0.30,0.55,0.66,0.70,1.05,1.15,1.21,1.25,1.30,1.90,2.60,3.10}s-desktop.png`
- `docs/gauntlet/t4/rodada-3/t-{1.90,2.60}s-mobile.png`
- `docs/gauntlet/t4/rodada-3/pose-final-1024.png` e `pose-final-diff.png`
- `docs/gauntlet/t4/rodada-3/metricas.json`
