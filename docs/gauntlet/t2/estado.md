# T2 — Estado do Gauntlet Loop (Passagem de Bastão → Rodada 6)

Branch: `GUSTAVOHOOO/splash-t2-cubo` · Referência visual: `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (`1024×1024`).
Perfis SVG originais em `src/assets/logo/perfis/` estão **intactos** (nenhum SVG foi editado até a rodada 5). O próximo construtor assume na **rodada 6**.

## 1. Arquitetura de `src/scripts/splash/cena/` e modos debug

| Arquivo | Responsabilidade e símbolos principais |
|---|---|
| `constantes.ts` | Medidas de `geometria.json`, frustum (`3.025688`), elevação (`33.3712°`), ancoragem no topo, paleta `CORES`, espessura de traço (`5.5 px` / `1.45 px` em 1024) e `DIRECAO_LUZ_RAW` (`-0.335, 1.0, 0.26`). |
| `camera.ts` | `criarCameraCubo()`, `atualizarEnquadramentoCamera(camera, w, h)` — ortográfica 45°/33.37° em modo `contain` no quadrado `min(w, h)`. |
| `luz.ts` | `criarLuzCena()` — `DirectionalLight` fixa, `shadow.mapSize = 4096²`, frustum `[-0.95, 0.95]`, `BasicShadowMap` (sem borrão). |
| `materiais.ts` | `criarMaterialChapado(opcoes)` — `MeshLambertMaterial` + `onBeforeCompile` (cores chapadas por normal local + sombra dura em dois tons + máscaras `mascaraDireitaR` e `mascaraOmbroR`). |
| `contorno.ts` | `criarMaterialContorno()`, `criarMaterialLinhaFrente()`, `criarContornoGeometria(geom, mat, { transformar, recortarDireitaR, segmentosExtras })`, `criarLinhaConstrucaoFrontalW(mat)` — `EdgesGeometry(25°)` → `LineSegments2`. |
| `pecas.ts` | `criarPecasCubo(dirLuz, matContorno)` e `POSICOES_FINAIS` — carrega os 4 SVGs (`?raw`) via `SVGLoader` + `path.toShapes()` + `ExtrudeGeometry` (`bevelEnabled: false`, `curveSegments: 64` no R) e monta 3 `THREE.Group`s (`w`, `r`, `quarto`) prontos para T4. |
| `linhas-construcao.ts` | `criarLinhasConstrucaoSvg(svg)` — 12 `<line>` únicas sem sobreposição (abordagem T0) projetadas pela câmera no `<svg>` atrás do `<canvas>`. |
| `cubo.ts` / `index.ts` | `criarCena(canvas, svgLinhas)` — retorna `{ renderer, scene, camera, pecas: { w, r, quarto }, renderizar, redimensionar, destruir }`. |
| `debug.ts` | `iniciarModoDebug(elementos, modoCaptura)` — implementa `/?debug` e `/?debug=captura`. |

**Como funcionam `/?debug` e `/?debug=captura`:**
- `src/pages/index.astro` (script inline no `<head>`): se `params.has('debug')`, adiciona `splash-ativa` + `splash-debug` (e `splash-captura` se `debug=captura`) sem ler/gravar `sessionStorage` nem disparar timeout.
- `src/components/Splash.astro`: inclui `<svg data-splash-linhas>` (`z-[15]`, `hidden` fora de debug) entre `[data-splash-fundo]` (`#FAFAF8`) e `[data-splash-canvas]` (`z-20`, WebGL `alpha: true`), e expõe `data-splash-ref-jpg={refJpg.src}`.
- `src/scripts/splash/controlador.ts`: detecta `?debug`, importa `./cena/debug` sob demanda e retorna antes de importar `animacao.ts` ou registrar skip/teto.
  - `/?debug`: tela cheia, JPG alinhado em `min(100vw, 100vh)`, painel com slider 0–100%, "Só JPG"/"Só 3D" e `mix-blend-mode: difference`.
  - `/?debug=captura`: força `#wr-splash` a `1024×1024` CSS px, `dpr = 1`, zero UI/overlay, e marca `document.documentElement.dataset.capturaPronta = '1'` após 2 rAFs.

## 2. Gates automáticos e artefatos

```sh
node tools/gauntlet/t2-rodada.mjs <n>
```

- Dependências isoladas em `tools/gauntlet/package.json` (`playwright`, `pixelmatch`, `pngjs`, `sharp`); **nunca** adicione nada ao `package.json` da raiz.
- Etapas do script: (1) `npx astro check` + `npx astro build` na raiz; (2) sobe `npx astro preview --port 4403 --host 127.0.0.1` (ou reutiliza porta 4403); (3) captura `/?debug=captura` em `1024×1024`, `dpr = 1`, coletando erros/avisos de console; (4) calcula `pixelmatch` (`threshold: 0.1`) contra `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`, gera `diff.png` e `sobreposicao-50.png`; (5) amostra mediana 5×5 em 8 pontos fixos.
- Saída gravada em `docs/gauntlet/t2/rodada-<n>/`: `captura.png`, `diff.png`, `sobreposicao-50.png`, `metricas.json`.

## 3. Decisões e truques não óbvios

- **Coordenadas e pivôs**: cubo perfeito em `[-0.5, +0.5]³` (`1000` u SVG → `1.0`, parede `0.135`). Cada peça usa `envolverEmPivo(nome, pivo, filhos)` com um subgrupo deslocado em `-pivo`, mantendo `position` dos vértices sempre em `[-0.5, +0.5]³` no shader mesmo se T4 mover/rotacionar o grupo.
- **Extrusão sem inverter winding**: `ExtrudeGeometry` em coordenadas SVG Y-down seguida de `scale(1/1000)` + `rotateX(Math.PI)` (`det = +1`), preservando normais externas sem precisar de `DoubleSide`.
- **Ancoragem da câmera**: ancorada no topo (`T_back = (511.45, 237.22)`, `T_front = (511.46, 500.49)`) via frustum assimétrico; a diferença aceita de ~1,7% (`~4,85 px`) fica concentrada na base.
- **Encontros sem z-fighting nem emendas no topo branco**:
  - `W` recua `0.0008` em `X = +0.5`; `R` recua o corpo para `Z ≤ +0.365` + `BoxGeometry` fina ocre cobrindo a quina do W; `fundo-esquerda` limita `Z ≤ +0.365`; `fundo-direita` limita `X ∈ [-0.365, +0.4992]`.
  - `transformar` em `contorno.ts` remove emendas coplanares no topo `Y = +0.5` e arestas verticais coplanares atrás da face ocre do R.
- **Regra "à direita do R"**: `wrEstaADireitaDoR` (GLSL em `materiais.ts` e versão TS em `contorno.ts`) projeta `fundo-direita` ortograficamente no plano `X = 1000` do R (`xR = X - Z`, `yR = 1000 - (Y + 0.93148*(1000 - X))`) e descarta malha/arestas que vazariam abaixo do topo à direita do bojo e da perna do R.
- **Quina superior direita do R (R2)**: `r.svg` curva para baixo a partir de `x_svg = 660` (`Z = +0.16`). Para fechar o aro branco reto até `T_right`/`In_right` sem editar `r.svg`, `pecas.ts` adiciona `meshRTopoContinuo` (`PlaneGeometry` em `Y = +0.5`, `castShadow = false`) + 2 segmentos retos extras em `contornoR`, remove o arco traseiro `X = +0.365` do ombro em `transformarArestasR` e descarta a superfície curva saliente via `uMascaraOmbroR`.
- **Furo interno ("olho") do R (R3)**: o JPG desenha o furo com profundidade aparente `112/1000` (vs `135/1000` externo). `ajustarProfundidadeFuroR` e `transformarArestasR` avançam só os vértices/arestas traseiros do furo de `X = +0.365` para `X = +0.388`. Em `materiais.ts`, o furo ignora a auto-sombra da barra superior do R (aplicando peitoril `#EBEAE6` limpo e corte diagonal `#C6C5C1` em `Y > 610 - 0.15*(1000 - X)`) e `fundo-direita` vista só através do furo (`X > 335, Y < 300`) usa o corte diagonal `Y < 196 - 0.212*(X - 363)`.
- **Face inferior da perna diagonal do R (R4)**: medição 3× contra `docs/logo/retificado/r.png` e o JPG confirmou que `r.svg` já bate em `< 0,8 px` na face ocre da perna (largura ocre idêntica: `68–71 px` horizontais; o deslocamento de `+2–4 px` em `x` a `y` fixo é 100% efeito da altura aceita de `1,7%` do cubo perfeito), mas o JPG desenha a face inferior cinza da perna com profundidade aparente `196/1000` (`~19,9 px` centro-a-centro / `~14,4 px` cinza interno, vs `~8,4 px` com `135/1000`) e tom `#B3B4AE`. `ajustarProfundidadePernaR` e `transformarArestasR` estendem só os dois vértices traseiros dessa face (`(520, 626)` e `(770, 1000)`) para `X = +0.304`; `materiais.ts` aplica `CORES.sombraPernaR = '#B3B4AE'` exclusivamente nessa face (`uMascaraOmbroR > 0.5 && vWrLocalPos.y < -0.120 && wrNLocal.y < -0.2 && wrNLocal.z > 0.5`), preservando `#C6C5C1` global.
- **Batente interno direito da porta em `fundo-esquerda` (R5)**: o JPG desenha o batente da porta com profundidade aparente `70/1000` (vs `135/1000` do topo da parede, já documentado em `perfis.md`), cinza vertical uniforme `#CCCCC7` (mediana de 702 px no JPG; `Δmax ≤ 2` de `#CECDC9`) sem sombra diagonal do lintel, e linha de fechamento/soleira em `y ≈ 533 px` na fresta à direita da porta (`y_svg ≈ 810`). Em `pecas.ts`, `ajustarProfundidadePortaFE` + `transformarArestasFE` (sobre `geomFEContorno` clonado antes da mutação) avançam só os vértices traseiros (`X = -0.5`) da abertura da porta para `X = -0.435` (`70/1000`) e `contornoFE` inclui o segmento extra `(-0.365, -0.310, -0.105) → (-0.365, -0.310, -0.165)`. Em `materiais.ts`, `CORES.batentePorta = '#CCCCC7'` pinta uniformemente apenas o batente (`uIgnoraSombraInternaX > 0.5 && wrNLocal.z > 0.85 && vWrLocalPos.z < 0.0 && vWrLocalPos.y < 0.180`) e `uCorTopo` clareia o triângulo sob a soleira (`wrNLocal.x > 0.85 && vWrLocalPos.z < -0.105 && vWrLocalPos.y < -0.310`).
- **Sombra dura em dois tons**: `WebGLRenderer` com `NoToneMapping` + `SRGBColorSpace` + `BasicShadowMap`. No `onBeforeCompile` de `materiais.ts`, `getShadow(...) < 0.5` ou `nWorld.y < -0.15` ou `dot(nWorld, uDirLuz) < -0.05` comuta direto para `#C6C5C1` (`fundo-esquerda` ignora auto-sombra em `nLocal.x > 0.85`).
- **Contorno `LineSegments2`**: `LineMaterial` recebe bias de profundidade no vertex shader (`clip.z -= 0.0012 * clip.w`) + `polygonOffset(1, 1)` nas malhas para que cantos côncavos (`In_back`) não percam metade da largura do traço.
- **Linhas de construção**: 12 `<line>` no `<svg>` atrás do canvas (extensão `0.223`, ápices `0.177`, cor `#343432`, largura `1.45 px`), mais 1 `LineSegments2` fina (`criarLinhaConstrucaoFrontalW`) no plano `Z = +0.5, Y = +0.5` cruzando o vão aberto do W.

## 4. Histórico de rodadas

| Rodada | Commit | O que mudou | Check/Build/Console | Diff% (`0.1`) | Nota crítico |
|---|---|---|---|---|---|
| 1 | `e9d80ed` | Cena 3D completa, `/?debug` + `/?debug=captura`, gates `tools/gauntlet/` | OK / OK / 0 err, 0 warn | `2,8996%` (30.404 px) | 6 (FAIL) |
| 2 | `2b8d0c4` | Falha 1: aro branco reto contínuo até `T_right`/`In_right` e remoção do arco solto/extrusão curva no ombro do R | OK / OK / 0 err, 0 warn | `2,8628%` (30.019 px) | 7 (FAIL) |
| 3 | `cb59fcb` | Falha 1: profundidade `112/1000` no furo do R, peitoril limpo, corte contínuo no teto curvo e triângulo diagonal em `fundo-direita` no vão | OK / OK / 0 err, 0 warn | `2,6222%` (27.496 px) | 8 (FAIL) |
| 4 | `24e7b72` | Falha 1: profundidade aparente `196/1000` na face inferior da perna diagonal do R (`~14,5 px` cinza interno) e tom `#B3B4AE` isolado (`sombra_sob_r` `Δmax = 0`), sem editar `r.svg` | OK / OK / 0 err, 0 warn | `2,5846%` (27.101 px) | 7,5 (FAIL) |
| 5 | *(este commit)* | Falha 2: profundidade `70/1000` no batente direito da porta (`fundo-esquerda`), cinza vertical uniforme `#CCCCC7` sem sombra diagonal do lintel e fechamento/soleira em `y ≈ 533 px`, sem editar SVGs | OK / OK / 0 err, 0 warn | `2,5140%` (26.361 px) | *(aguardando crítico)* |

## 5. Lacunas abertas (`rodada-4/critica.md` → passagem para o construtor da rodada 6) e armadilhas a evitar

1. **Falha 1 (BLOQUEADA — aguarda decisão do dono sobre editar `w.svg`) — Geometria do "W" (`x ≈ 320–460, y ≈ 365–685`)**: pico central ~7–10 px mais alto/à esquerda, V inferior interno ~8–9 px à esquerda e degrau superior esquerdo ~4–6 px à esquerda em relação ao JPG. **Não edite `src/assets/logo/perfis/w.svg` sem liberação explícita.**
2. ~~**Falha 2 (resolvida na R5) — Batente interno direito da porta (`x ≈ 415–447, y ≈ 396–535`)**~~: resolvida via profundidade `70/1000` (`X = -0.435`), tom vertical uniforme `#CCCCC7` sem sombra diagonal e linha de fechamento/soleira em `y ≈ 533 px` (`batente-antes-depois.png`, `-740 px` no diff, `0 px` alterados fora de `[414..456, 403..547]`).
3. **Falha 3 (próxima candidata na R6 se Falha 1 seguir bloqueada) — Dentes pretos salientes em arestas retas externas e pontas em vértices**: bordas superiores do cubo (`(303, 353)`, `(543, 257)`), base do "R" (`(541, 758)`, `(713, 663)`), quinas internas do "R" (`(552, 601)`, `(552, 647)`) e cantos superiores da porta (`(385, 429)`, `(445, 396)`). **Causa provável**: arestas traseiras/de profundidade ocultas (que partem de vértices frontais para o interior da parede, como `X = 0.5 → 0.365` na forquilha/quinas ou `X = -0.365 → -0.435` no topo da porta) vazando nos primeiros `~0,024 u` devido ao bias `clip.z -= 0.0012 * clip.w` de `LineMaterial`.

> **Nota de passagem de bastão (→ Rodada 6):** o próximo construtor assume a partir da `rodada-5/critica.md` (assim que o crítico independente avaliar esta rodada 5). Confira se `w.svg` foi liberado ou continua bloqueado antes de escolher a falha da rodada 6.

**Armadilhas conhecidas:**
- Use `path.toShapes()` (0 argumentos) — `SVGLoader.createShapes()` emite warning de deprecação e `toShapes(false)` falha no `astro check` (`@types/three` 0.187).
- Playwright nesta máquina usa `channel: 'chrome'` como fallback (o `chromium_headless_shell` do pacote não está baixado); **não** force `--use-angle=swiftshader-webgl` como primeira opção, pois dispara warning `GPU stall due to ReadPixels` no console.
- Ao alterar apenas 1 região, não mexa em `DIRECAO_LUZ_RAW` sem verificar se a cunha de sombra principal em `fundo-direita` (`ΔX/ΔY = 0.335`) e a porta/janela não regrediram.
- Nunca altere `package.json` da raiz nem `src/scripts/splash/animacao.ts`.
