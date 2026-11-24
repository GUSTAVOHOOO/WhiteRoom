# T6b — Rodada 1: Notas de Diagnóstico, Ajustes de Impacto e Correção do Glitch da Perna do R

Data: 2026-11-24 · Branch: `GUSTAVOHOOO/splash-t6b-entradas` · Base: `f03f48e T6 rodada 1: snap pelo dpr real e pouso em dpr fracionário`.
Escopo alterado em `src/`: apenas `src/scripts/splash/animacao.ts`, `src/scripts/splash/cena/pecas.ts` e `src/scripts/splash/cena/linhas/visibilidade.ts` (sem tocar em `controlador.ts`, `index.astro`, `Splash.astro` ou `global.css`).

---

## 1. Pedido 2 — Causa Raiz do Glitch na Perna Esquerda do R no Celular

Reproduzimos o problema capturando **61 quadros a cada `1/120 s` (`0,85–1,35 s`)** com recortes 4× da junção da perna esquerda do R com a coluna direita do W em `390×844 dpr 3`, `360×740 dpr 3`, `768×1024 dpr 2` e `1280×800 dpr 1` (evidências baseline em `docs/gauntlet/t6b/baseline/grade-r-antes-*.png` e comparativo 4× em `docs/gauntlet/t6b/rodada-1/glitch-perna-r-antes-depois-4x.png`).

### Auditoria das 4 suspeitas e causa real confirmada

O glitch no celular era resultado de **três mecanismos acoplados** (com um quarto fator agravante):

1. **Trajetória em retrato muito íngreme + compensação `-camBack` rasa em `animacao.ts` (Causa primária #1 — CONFIRMADA)**:
   - Em `recalcularLayout()`, `wInicio`/`rInicio` usavam `deslocH = meiaLargura * 0.85 + 1.15` e `deslocV = meiaAltura + 1.15`.
   - No desktop (`1280×800`), isso gerava razão `V/H = 0,837` (diagonal de `39,9°`) e `rInicio = (+3,287, -2,224, -1,215)`.
   - No celular retrato (`390×844` e `360×740`), `meiaAltura` é `> 2× meiaLargura`, levando a razão para **`V/H = 1,754` (`60,3°`)**: o R subia quase na vertical por baixo da coluna direita do W, atravessando o volume do W (`t = 0,992–1,067 s`, exibindo um coto cinza sob o pé preto do W e um encontro sem contorno no topo) e derrubando `rInicio.z` para `-0,056`, onde a compensação `-camBack` estacionava em **`rInicio.z = -0,25`** (`4,9×` mais raso em profundidade Z do que no desktop).
2. **Remoção indevida de emenda coplanar no HLR + tolerância 3D inflada em retrato em `cena/linhas/visibilidade.ts` (Causa primária #2 — CONFIRMADA)**:
   - Em `visibilidade.ts`, `pontoEmFaceCoplanarVizinha()` comparava a face frontal preta do W (`malha-w`, normal `+Z`, `#171717`) contra a face lateral esquerda cinza da malha de voo do R (`malha-r-solido`, normal `+Z`, `#EBEAE6`) e **apagava as arestas de contorno vertical e inferior do W** assim que `|rzOff| < epsPlanoEmendaNdc × camBack.z`.
   - Agravante em retrato: `visibilidade.ts` multiplicava `EPS_OCLUSAO_NDC`, `PASSO_EMENDA_MUNDO`, `EPS_PLANO_EMENDA_NDC` e `tolAlinhamentoW` por `escalaCubo = 1,175` (zoom de enquadramento retrato), inflando em `+17,5%` tolerâncias que pertencem ao espaço 3D/NDC (onde o cubo continua `1×1×1` e o frustum `near..far` continua `0,1..40`).
   - Como `rInicio.z = -0,25` era `4,9×` menor no celular, `|rzOff|` cruzava esse limiar já em `t ≈ 1,08 s` enquanto o R ainda estava `1,3–3 px` separado do W, apagando o traço preto da quina do W e abrindo uma fresta/linha cinza vertical piscante em `t = 1,08–1,21 s` (`390×844` `f30-t-1.1000s-4x.png`).
3. **Z-fighting de `malha-r-solido` sem recuo em `+Z` na cauda assintótica do `expo.out` (Causa primária #3 — CONFIRMADA)**:
   - Diferente do W (que já tinha `INSET_QUINA = 0,0008` em `+X` para nunca disputar profundidade com a face ocre do R), `geomRSolido` mantinha a face cinza `+Z` em exatos `Z = +0,5000` e permanecia ativa até `rPosT >= 1 - 1e-6`.
   - Com a cauda longa do `expo.out` e `rInicio.z = -0,25`, nos últimos milissegundos antes do encaixe (`t = 1,2167 s` em `360×740`, `t = 1,218 s` em `390×844`) `rzOff` caía para **`-0,000001` a `-0,000002` u** — da mesma ordem do LSB de 24 bits do depth buffer (`39,9 / 2^24 = 2,38e-6 u`) — causando **z-fighting severo** com faixas cinzas rasgando toda a altura da coluna preta do W (`360×740` `f44-t-1.2167s-4x.png`).
4. **Teto WebGL `dpr <= 2` (Suspeita #4 — DESCARTADA como causa raiz)**:
   - O teto `dpr <= 2` no canvas WebGL em `min(w, h) <= 500` não causou o glitch (o z-fighting e a remoção da linha acontecem em 3D/HLR independentemente do dpr); o que tornou a linha ausente ainda mais visível no celular foi justamente o SVG HLR nítido em `dpr 3` sobre a fresta cinza.

### Correções aplicadas

1. **`src/scripts/splash/animacao.ts` (`recalcularLayout`)**:
   - Limitada a inclinação da trajetória de entrada em retrato à mesma família do desktop (`razaoVhMax = 0,84`, ~`40°`, com `deslocVMin = meiaAltura * 0,78` garantindo entrada fora da tela pelo canto inferior em todos os 8 viewports e mantendo `desktop`/`paisagem` 100% inalterados).
   - Resultado: `rInicio.z` no celular passou de `-0,25` para **`-0,985`** (`390×844`), **`-0,935`** (`360×740`) e **`-0,854`** (`768×1024`), eliminando a subida íngreme por baixo do W. Guarda defensiva elevada para `rInicio.z <= -0,5`.
2. **`src/scripts/splash/cena/pecas.ts` (`criarPecasCubo`)**:
   - Aplicado `limitarEixoGeometria(..., 'z', 'max', 0.5 - INSET_QUINA)` (`Z <= 0,4992`, espelho exato do recuo do W em `+X`) em `geomRSolido` e `geomRSolidoHlr`. A face `+Z` do R em voo fica sempre `>= 0,0008 u` (`336×` o LSB do z-buffer e `4,2×` `EPS_OCLUSAO_NDC`) atrás da face preta do W — mesmo a `0,1 ms` do impacto (`t = 1,2499 s`). Como `malha-r-solido` fica oculta na pose final e na T2, o diff na pose final é `0,0000%`.
3. **`src/scripts/splash/cena/linhas/visibilidade.ts` (`MotorVisibilidadeHlr`)**:
   - Separado `escalaMundo = Math.min(1, escalaCubo)` para as tolerâncias 3D/NDC (`epsOclusaoNdc`, `passoEmendaMundo`, `epsPlanoEmendaNdc`, `tolAlinhamentoW`), mantendo `escalaCubo` apenas nas tolerâncias 2D em pixels (e na espessura de traço em `svg.ts`).
   - Impedido que `malha-r-solido` participe de `pontoEmFaceCoplanarVizinha()` (tanto como triângulo vizinho quanto como aresta candidata), garantindo que o R em voo nunca apague o contorno preto do W nem suas próprias arestas antes do encaixe em `t = 1,25 s`.
4. **Sinergia com a curva acelerada (`power2.in`)**:
   - Mesmo a `120 Hz` (`1/120 s` antes do impacto, `t = 1,2417 s`), `rxOff >= +0,18 u > 0,135 u` em todos os viewports — ou seja, `malha-r-solido` e `malha-w` permanecem 100% disjuntos em 3D em todo quadro `60 Hz` e `120 Hz` antes do encaixe. Além disso, a varredura de estresse sub-quadro (`1,240–1,251 s` a cada `1 ms`, incluindo `1,2495` e `1,2499 s`) confirmou **`0` quadros com z-fighting** e **`0` falhas de contorno** nos 4 viewports.

---

## 2. Pedido 1 — Curvas e Valores Novos dos Impactos (W e R vs. Quarto)

| Parâmetro | W — Antes (T6 r1) | W — Depois (T6b r1) | R — Antes (T6 r1) | R — Depois (T6b r1) | Quarto (Clímax — inalterado) |
|---|---|---|---|---|---|
| **Janela de entrada** | `0,30–0,70 s` (`0,40 s`) | **`0,35–0,70 s`** (`0,35 s`, +0,05 s) | `0,85–1,22 s` (`0,37 s`) | **`0,90–1,25 s`** (`0,35 s`, +0,05 s) | `1,60–1,865 s` (`0,265 s`) |
| **Instante de impacto** | `0,70 s` | **`0,70 s`** (idêntico) | `1,22 s` | **`1,25 s`** (conforme coreografia) | `1,865 s` (pico `1,90 s`) |
| **Curva (GSAP)** | `expo.out` (freando) | **`power2.in`** (`t³`, acelera até bater) | `expo.out` (freando) | **`power2.in`** (`t³`, acelera até bater) | `power4.in` (`t⁵`, acelera até bater) |
| **Vel. no impacto 1280×800 (60 fps)** | `0,06 px/q` | **`149,42 px/q`** (`~2.490×`) | `0,07 px/q` | **`149,42 px/q`** (`~2.135×`) | **`172,19 px/q`** (mais forte) |
| **Vel. no impacto 390×844 (60 fps)** | `0,04 px/q` | **`69,68 px/q`** (`~1.742×`) | `0,05 px/q` | **`69,68 px/q`** (`~1.394×`) | **`147,36 px/q`** (mais forte) |
| **Tremor rígido (pico)** | `1,89 px` (`+1,6/+1,0`) | **`2,44 px`** (`+2,0/+1,4`, cima-dir.) | `1,89 px` (`-1,6/+1,0`) | **`2,44 px`** (`-2,0/+1,4`, cima-esq.) | **`3,91 px`** (`+2,5/-3,0`, baixo) |
| **Ciclos / duração do tremor** | 2 etapas · `70 ms` | **4 inversões amortecidas · `125 ms`** (`5 × 25 ms`, `0,70–0,825 s`) | 2 etapas · `70 ms` | **4 inversões amortecidas · `125 ms`** (`5 × 25 ms`, `1,25–1,375 s`) | 5 etapas · `160 ms` (`1,865–2,025 s`) |
| **Pulso das linhas** | `1,018` (`100 ms`) | **`1,027`** (`25 ms` subida + `110 ms` retorno = `135 ms`) | `1,018` (`100 ms`) | **`1,027`** (`25 ms` subida + `110 ms` retorno = `135 ms`) | **`1,032`** (`210 ms`) |
| **Achatamento** | Nenhum | **Nenhum** (ver §3) | Nenhum | **Nenhum** (ver §3) | `7%` (`sqY 0,93`, `sqX/Z 1,03`, `elastic.out`) |

**Nota sobre GSAP `power2.in` vs `power3.in`:** no GSAP 3, `power2.in` corresponde a `t³` (cúbica) e `power3.in` a `t⁴` (quártica), enquanto `power4.in` é `t⁵` (quíntica). Testamos primeiro `power3.in` (`t⁴`, `0,36 s`), mas em `1280×800` a velocidade no impacto chegou a `189,53 px/q` — ultrapassando o clímax do quarto (`172,19 px/q`) e concentrando o movimento visível nos últimos `~30 ms`. Ajustando para **`power2.in` (`t³`) em `0,35 s`**, W e R batem com **`149,42 px/q`** no desktop (`86,8%` do quarto) e **`69,68 px/q`** no celular, com leitura clara da aceleração nas tiras e preservando o quarto como impacto mais forte dos três.

---

## 3. Decisão sobre o Achatamento Opcional de W e R

**Decisão: DESCARTADO para W e R** (mantido exclusivamente no clímax do quarto branco).

**Justificativa geométrica e verificação:**
1. Na pose encaixada (`t >= 1,25 s`), o W ocupa a quina frontal `X ∈ [0,365, 0,4992], Z ∈ [0,365, 0,500]`, enquanto o R é composto por `malha-r-corpo` (`Z <= 0,365`) e `malha-r-quina` (`X = 0,500, Z ∈ [0,365, 0,4992]`).
   - Qualquer compressão individual de `peca-r` em `Y` (mesmo `<= 4%`) encurta `malha-r-quina` e expõe a lateral cinza `+X` do W ou abre degrau no topo branco.
   - Qualquer compressão individual em `X` ou empurra `malha-r-quina` para trás da lateral cinza do W (`X < 0,4992`) ou abre fresta na emenda interna do topo branco (`X = 0,365`).
   - Comprimir `peca-r` em `Z` ancorado em `Z = +0,5` faz `malha-r-corpo` invadir o topo branco do W (`Z > 0,365`, gerando linha/emenda duplicada) e descola a borda traseira do R (`Z = -0,5`) das linhas de construção em `~8 px`, violando a regra do dono ("peça que encostou na pose final não sai mais dali").
   - Comprimir `pivoSquash` (W+R juntos) deslocaria o centro projetado de W e R em `~3–4 px` após o contato, descolando ambos do hexágono de construção e quebrando o teste de regressão `estabilidadePosImpacto` (`<= 0,5 px`).
2. Sem achatamento em W/R, a força do impacto vem da desaceleração instantânea `149,4 → 0 px/q` (desktop) / `69,7 → 0 px/q` (celular), transferida para o tremor rígido da cena inteira (`2,44 px`, `125 ms`, `4` inversões, com `matrizConstrucao = pivoShake.matrixWorld`) e pulso radial das linhas (`1,027`), mantendo:
   - **Maior fresta medida após o contato (`0,70–0,85 s` e `1,25–1,60 s` @ `1/120 s`)**: **`0,0000 px`** em todos os 4 viewports (`maiorFrestaWPx = 0`, `maiorFrestaRPx = 0`, `maiorDesvioEscala = 0`, `pixelsFundoNaCosturaRWMax = 0`).

---

## 4. Resumo do Gate (`node tools/gauntlet/t6b-rodada.mjs 1`, porta `4404`)

- **`astro check` / `astro build` / console**: OK / OK / **`0` erros, `0` avisos, `0` pageErrors**.
- **`gerar-logo-svg --check`**: **9/9 OK byte a byte**.
- **Pose final `t = 2,4 s` vs. T6 r1 (todos os 8 viewports)**: **`0,0000%`** (`0 px` diferentes em todos os 8 viewports).
- **Diff desktop vs. T5 (`2,59 s`, `2,60 s`) e pose `1024×1024` vs. T2 r7**: **`0,0000%`** (`0 px`).
- **Glitch perna R (`0,85–1,35 s` @ `1/120 s` + estresse `1 ms` `1,240–1,251 s`)**: **`0` quadros com z-fighting**, **`0` quadros com `malha-r-solido` pós-contato**, **`0` quadros sem tremor nas linhas** nos 4 viewports.
- **Maior fresta pós-contato (`1/120 s`)**: **`0,0000 px`** geométrico e **`0` pixels** de fundo na costura W↔R nos 4 viewports.
- **Regressão T6 r1**:
  - Enquadramento: **8/8 OK** (`54,89–54,92%` retrato/tablet, paisagem com folga `+26,3`/`+19,4 px`).
  - Pouso `390×844 dpr 3`: **`0,0035%`** (troca `2,59↔2,61`: **`0,0004%`**).
  - Pouso desktop DPR `1,25` / `1,5` / `2` / `1366×768 dpr 1,25`: **`0,0000%–0,0204%`** (troca **`0,0000%`**).
  - Altura dinâmica/rolagem, toque (pular `327 ms`, `0` cliques fantasma, drag `scrollY=0`, toque duplo), rotação (`1,0 s` e `2,7 s`), reduzido/fallback celular: **todos OK**.
  - Desempenho celular (`390×844 dpr 3`): CPU 1× `pronto = 112,9 ms` / `p95 = 9,0 ms`; CPU 4× **`pronto = 412,6 ms`** (`<= 800 ms`) / **`p95 = 20,1 ms`** (`<= 33 ms`); CPU 6× `pronto = 738,9 ms` / `p95 = 26,9 ms`.
  - 11 testes de regressão da T5: **11/11 OK**.
- **Servidor preview porta `4404`**: encerrado automaticamente no `finally` (portas `4403` e `4405` intocadas).
