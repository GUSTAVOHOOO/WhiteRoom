# T2 — Estado do Gauntlet Loop (Passagem de Bastão → Rodada 7)

Branch: `GUSTAVOHOOO/splash-t2-cubo` · Referência visual: `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (`1024×1024`).
Perfis SVG originais em `src/assets/logo/perfis/` estão **intactos** (nenhum SVG foi editado até a rodada 6). Nenhuma dependência nova foi adicionada ao `package.json` da raiz.

## 1. Arquitetura de `src/scripts/splash/cena/` e modos debug

| Arquivo | Responsabilidade e símbolos principais |
|---|---|
| `constantes.ts` | Medidas de `geometria.json`, frustum (`3.025688`), elevação (`33.3712°`), ancoragem no topo, paleta `CORES`, espessura de traço (`5.5 px` / `1.45 px` em 1024), `SEGMENTOS_CURVA_R` (`64`), `SEGMENTOS_CURVA_R_HLR` (`32`) e `DIRECAO_LUZ_RAW` (`-0.335, 1.0, 0.26`). |
| `camera.ts` | `criarCameraCubo()`, `atualizarEnquadramentoCamera(camera, w, h)` — ortográfica 45°/33.37° em modo `contain` no quadrado `min(w, h)`. |
| `luz.ts` | `criarLuzCena()` — `DirectionalLight` fixa, `shadow.mapSize = 4096²`, frustum `[-0.95, 0.95]`, `BasicShadowMap` (sem borrão). |
| `materiais.ts` | `criarMaterialChapado(opcoes)` — `MeshLambertMaterial` (sem `polygonOffset`) + `onBeforeCompile` (cores chapadas por normal local + sombra dura em dois tons + máscaras `mascaraDireitaR` e `mascaraOmbroR`). |
| `pecas.ts` | `criarPecasCubo(dirLuz)` e `POSICOES_FINAIS` — carrega os 4 SVGs (`?raw`) via `SVGLoader` + `path.toShapes()` + `ExtrudeGeometry` (`bevelEnabled: false`, `curveSegments: 64` no R; `32` para geometria HLR do R), aplica `dividirGeometriaEmPlano` nas emendas do topo branco para eliminar T-junctions, e monta 3 `THREE.Group`s (`w`, `r`, `quarto`) com metadados `userData.hlr`. |
| `linhas/tipos.ts` | Contratos internos de arestas locais, malhas HLR, segmentos/polilinhas 2D e API pública `LinhasHLR`. |
| `linhas/mascaras.ts` | Versão TS pura de `pontoEstaADireitaDoR` e `faceNoOmbroDescartadoR`, espelhando exatamente as máscaras GLSL de `materiais.ts`. |
| `linhas/arestas.ts` | `extrairDadosMalhaHlr` — extrai uma única vez por malha, em espaço local, triângulos frontais de oclusão e arestas candidatas (vincos ≥ 25°, silhuetas para a câmera fixa, bordas abertas e aresta extra da soleira da porta), descartando arestas cujas faces adjacentes estão todas de costas para a câmera. |
| `linhas/construcao.ts` | `ARESTAS_CONSTRUCAO` — as 12 linhas virtuais de construção (asteriscos + prolongamentos do T0, com `T_left -X` estendida até `T_front` atravessando o vão do W), todas passando pelo HLR. |
| `linhas/visibilidade.ts` | `MotorVisibilidadeHlr` — por quadro: projeta triângulos e arestas pela câmera ortográfica fixa, indexa em grade 2D `32×32`, corta arestas em todos os cruzamentos 2D e extremos colineares, remove emendas coplanares entre peças **somente quando encostadas** (teste de continuidade coplanar a `0,003 u`), aplica máscaras de descarte e testa oclusão ortográfica exata no ponto médio (`ε = 8e-6 NDC`). |
| `linhas/encadear.ts` | `deduplicarEFundirColineares`, `subtrairCoincidentesComContorno`, `encadearEmPolilinhas` — deduplica segmentos coincidentes por reta suporte, subtrai trechos de construção cobertos pelo contorno preto, funde colineares e encadeia polilinhas (pareamento guloso pelo ângulo interno mais obtuso em vértices de grau ≥ 3 e fechamento `Z` em ciclos). |
| `linhas/svg.ts` | `criarCamadaSvgHlr`, `polilinhasParaPathD` — grava dois `<path>` (construção `#343432` ~1,45 px embaixo; contorno `#171717` ~5,5 px em cima), `stroke-linejoin: miter`, `stroke-linecap: butt`, `vector-effect: non-scaling-stroke`, coordenadas a `0,1 px`, e `paraSvgString()` pronto para T5. |
| `linhas/index.ts` | `criarLinhasHLR(pecas, camera, svg)` → `{ atualizar(), definirDimensoes(), paraSvgString(), destruir() }`, com cache de matrizes `matrixWorld` para não recalcular quando as peças estão paradas. |
| `cubo.ts` / `index.ts` | `criarCena(canvas, svgLinhas)` — retorna `{ renderer, scene, camera, pecas: { w, r, quarto }, linhas, renderizar, redimensionar, destruir }`. `renderizar()` executa WebGL + `linhas.atualizar()`. |
| `debug.ts` | `iniciarModoDebug(elementos, modoDebug)` — implementa `/?debug`, `/?debug=captura` e `/?debug=hlr`. |

**Como funcionam `/?debug`, `/?debug=captura` e `/?debug=hlr`:**
- `src/pages/index.astro` (script inline no `<head>`): se `params.has('debug')`, adiciona `splash-ativa` + `splash-debug` (e `splash-captura` se `debug=captura`) sem ler/gravar `sessionStorage` nem disparar timeout.
- `src/components/Splash.astro`: `<canvas data-splash-canvas>` (`z-20`, WebGL `alpha: true`) sobre `[data-splash-fundo]` (`#FAFAF8`), e `<svg data-splash-linhas>` (`z-30`, `hidden` fora de debug) **por cima** do canvas.
- `src/scripts/splash/controlador.ts`: detecta `?debug`, importa `./cena/debug` sob demanda e retorna antes de importar `animacao.ts` ou registrar skip/teto.
  - `/?debug`: tela cheia, JPG alinhado em `min(100vw, 100vh)` (`z-40`), painel (`z-50`) com slider 0–100%, "Só JPG"/"Só 3D" e `mix-blend-mode: difference`.
  - `/?debug=captura`: força `#wr-splash` a `1024×1024` CSS px, `dpr = 1`, zero UI/overlay, e marca `document.documentElement.dataset.capturaPronta = '1'` após 2 rAFs.
  - `/?debug=hlr`: modo de teste que anima as 3 peças pela coreografia do T0 (W do canto inferior esquerdo, R do inferior direito, quarto de cima, com leve squash), medindo `atualizar()` em tempo real (HUD + `window.__wrHlrBench`).

## 2. Gates automáticos e artefatos

```sh
node tools/gauntlet/t2-rodada.mjs <n>
```

- Dependências isoladas em `tools/gauntlet/package.json` (`playwright`, `pixelmatch`, `pngjs`, `sharp`).
- Etapas do script: (1) `npx astro check` + `npx astro build` na raiz; (2) sobe `npx astro preview --port 4403 --host 127.0.0.1` (ou reutiliza porta 4403); (3) captura `/?debug=captura` em `1024×1024`, `dpr = 1`, coletando erros/avisos de console; (4) calcula `pixelmatch` (`threshold: 0.1`) contra `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`, gera `diff.png` e `sobreposicao-50.png`; (5) amostra mediana 5×5 em 8 pontos fixos.
- Saída gravada em `docs/gauntlet/t2/rodada-<n>/`: `captura.png`, `diff.png`, `sobreposicao-50.png`, `metricas.json`.

## 3. Decisões e truques não óbvios

- **Coordenadas e pivôs**: cubo perfeito em `[-0.5, +0.5]³` (`1000` u SVG → `1.0`, parede `0.135`). Cada peça usa `envolverEmPivo(nome, pivo, filhos)` com um subgrupo deslocado em `-pivo`, mantendo `position` dos vértices sempre em `[-0.5, +0.5]³` no shader mesmo se T4 mover/escalar o grupo.
- **Extrusão sem inverter winding**: `ExtrudeGeometry` em coordenadas SVG Y-down seguida de `scale(1/1000)` + `rotateX(Math.PI)` (`det = +1`), preservando normais externas sem precisar de `DoubleSide`.
- **Ancoragem da câmera**: ancorada no topo (`T_back = (511.45, 237.22)`, `T_front = (511.46, 500.49)`) via frustum assimétrico; a diferença aceita de ~1,7% (`~4,85 px`) fica concentrada na base.
- **Encontros sem z-fighting nem frestas de T-junction no topo branco (R6)**:
  - `W` recua `0.0008` em `X = +0.5`; `R` recua o corpo para `Z ≤ +0.365` + `BoxGeometry` fina ocre cobrindo a quina do W (com quad limpo em `X = +0.5` para o HLR); `fundo-esquerda` limita `Z ≤ +0.365`; `fundo-direita` limita `X ∈ [-0.365, +0.4992]`.
  - `dividirGeometriaEmPlano` subdivide `geomW` (`X = ±0.365`), `geomFE` (`Z = -0.365`) e `geomFD` (`X = +0.365`) de forma 100% manifold (topo + paredes adjacentes), eliminando as 3 frestas de T-junction que vazavam cinza/magenta sobre o aro branco (diagnosticadas em `docs/gauntlet/t2/linhas/diagnostico.md`).
- **Pipeline de linhas vetoriais HLR em SVG (R6)**:
  - Substituiu integralmente `contorno.ts` (`EdgesGeometry` → `LineSegments2`/`LineMaterial`, bias `clip.z`, `criarLinhaConstrucaoFrontalW`, `transformarArestas*`, `recortarSegmentoDireitaR`), `linhas-construcao.ts` (SVG atrás do canvas) e `polygonOffset(1, 1)` das malhas.
  - Todas as linhas (contorno preto `5,5 px` e construção `#343432` `1,45 px`) são geradas na CPU em 2 `<path>` num único `<svg>` **sobre** o canvas, com `stroke-linejoin: miter`, `stroke-linecap: butt`, `vector-effect: non-scaling-stroke`.
  - Emendas coplanares somem automaticamente **apenas quando as peças encostam** (durante a animação em `/?debug=hlr`, cada peça mantém seu contorno completo e oclui corretamente as linhas atrás dela).
  - Desempenho medido em `/?debug=hlr` (150 quadros ativos em `1280×800`, desktop): **média `1,47 ms`**, **p95 `1,90 ms`** (meta: `≤ 4 ms` / `≤ 8 ms`), sem precisar de `three-mesh-bvh`.
- **Regra "à direita do R"**: `wrEstaADireitaDoR` (GLSL em `materiais.ts` e versão TS em `linhas/mascaras.ts`) projeta `fundo-direita` ortograficamente no plano `X = 1000` do R (`xR = X - Z`, `yR = 1000 - (Y + 0.93148*(1000 - X))`) e descarta malha e trechos de aresta que vazariam abaixo do topo à direita do bojo e da perna do R.
- **Quina superior direita do R (R2)**: `meshRTopoContinuo` (`PlaneGeometry` em `Y = +0.5`, `castShadow = false`) fecha o aro branco reto até `T_right`/`In_right` sem editar `r.svg`, `uMascaraOmbroR`/`faceNoOmbroDescartadoR` ocultam a superfície curva saliente, e o HLR extrai automaticamente as bordas retas do topo contínuo.
- **Furo interno ("olho") do R (R3)**: profundidade `112/1000` (`X = +0.388`) aplicada diretamente na geometria (`ajustarProfundidadeFuroR`), lida pelo HLR; peitoril `#EBEAE6` limpo e cortes diagonais preservados em `materiais.ts`.
- **Face inferior da perna diagonal do R (R4)**: profundidade `196/1000` (`X = +0.304`) aplicada diretamente na geometria (`ajustarProfundidadePernaR`), lida pelo HLR; tom `#B3B4AE` isolado em `materiais.ts`.
- **Batente interno direito da porta em `fundo-esquerda` (R5)**: profundidade `70/1000` (`X = -0.435`) aplicada diretamente em `geomFE` (`ajustarProfundidadePortaFE`), lida pelo HLR; cinza vertical uniforme `#CCCCC7` e soleira (`(-0.365, -0.31, -0.105) → (-0.365, -0.31, -0.165)`) preservados via `userData.hlr.arestasExtras`.
- **Sombra dura em dois tons**: `WebGLRenderer` com `NoToneMapping` + `SRGBColorSpace` + `BasicShadowMap`. No `onBeforeCompile` de `materiais.ts`, `getShadow(...) < 0.5` ou `nWorld.y < -0.15` ou `dot(nWorld, uDirLuz) < -0.05` comuta direto para `#C6C5C1` (`fundo-esquerda` ignora auto-sombra em `nLocal.x > 0.85`).

## 4. Histórico de rodadas

| Rodada | Commit | O que mudou | Check/Build/Console | Diff% (`0.1`) | Nota crítico |
|---|---|---|---|---|---|
| 1 | `e9d80ed` | Cena 3D completa, `/?debug` + `/?debug=captura`, gates `tools/gauntlet/` | OK / OK / 0 err, 0 warn | `2,8996%` (30.404 px) | 6 (FAIL) |
| 2 | `2b8d0c4` | Falha 1: aro branco reto contínuo até `T_right`/`In_right` e remoção do arco solto/extrusão curva no ombro do R | OK / OK / 0 err, 0 warn | `2,8628%` (30.019 px) | 7 (FAIL) |
| 3 | `cb59fcb` | Falha 1: profundidade `112/1000` no furo do R, peitoril limpo, corte contínuo no teto curvo e triângulo diagonal em `fundo-direita` no vão | OK / OK / 0 err, 0 warn | `2,6222%` (27.496 px) | 8 (FAIL) |
| 4 | `24e7b72` | Falha 1: profundidade aparente `196/1000` na face inferior da perna diagonal do R (`~14,5 px` cinza interno) e tom `#B3B4AE` isolado (`sombra_sob_r` `Δmax = 0`), sem editar `r.svg` | OK / OK / 0 err, 0 warn | `2,5846%` (27.101 px) | 7,5 (FAIL) |
| 5 | `72702d7` | Falha 2: profundidade `70/1000` no batente direito da porta (`fundo-esquerda`), cinza vertical uniforme `#CCCCC7` sem sombra diagonal do lintel e fechamento/soleira em `y ≈ 533 px`, sem editar SVGs | OK / OK / 0 err, 0 warn | `2,5140%` (26.361 px) | 7,5 (FAIL) |
| 6 | *(série F0–F4)* | Linhas vetoriais HLR em SVG sobre o canvas (`linhas/`), diagnóstico F0, remoção completa de `LineSegments2`/bias/`polygonOffset`/`criarLinhaConstrucaoFrontalW`, fechamento das 3 T-junctions do aro branco e modo de teste animado `/?debug=hlr` (`1,47 ms` média / `1,90 ms` p95) | OK / OK / 0 err, 0 warn | `2,5312%` (26.542 px) | *(aguardando crítico)* |

## 5. Lacunas abertas (`rodada-5/critica.md` → passagem após Rodada 6) e armadilhas a evitar

1. **Falha 1 (BLOQUEADA — aguarda decisão do dono sobre editar `w.svg`) — Geometria do "W" (`x ≈ 315–460, y ≈ 485–670`)**: pico central mais alto/à esquerda, vale direito fechando abertura triangular abaixo da porta e entalhe inferior esquerdo mais estreito. **Não edite `src/assets/logo/perfis/w.svg` sem liberação explícita.**
2. ~~**Falha 2 (resolvida na R5) — Batente interno direito da porta**~~: preservado na R6 sem regressão.
3. ~~**Falha 3 (resolvida na R6) — Esporões/dentes pretos nos vértices, linhas dobradas/sobrepostas e traços cinzas pontilhados no aro branco**~~: resolvidos integralmente pelo HLR vetorial em SVG com junções `miter` (`linhas-antes-depois.png`), deduplicação por reta suporte, camada de construção abaixo do contorno e subdivisão manifold das emendas do topo branco.
4. **Falha 4 (fora do escopo da R6 — mantida intacta por regra) — Tons das faces internas de espessura do "W" (`x ≈ 328–386, y ≈ 360–665`)**: parede vertical interna esquerda e chanfro inferior esquerdo atualmente compartilham `#C6C5C1` (crítica R5 sugere `~#D7D6D2` e `~#B3B4AE`).

**Armadilhas conhecidas:**
- Use `path.toShapes()` (0 argumentos) — `SVGLoader.createShapes()` emite warning de deprecação e `toShapes(false)` falha no `astro check` (`@types/three` 0.187).
- Playwright nesta máquina usa `channel: 'chrome'` como fallback (o `chromium_headless_shell` do pacote não está baixado); **não** force `--use-angle=swiftshader-webgl` como primeira opção, pois dispara warning `GPU stall due to ReadPixels` no console.
- Ao alterar apenas 1 região, não mexa em `DIRECAO_LUZ_RAW` sem verificar se a cunha de sombra principal em `fundo-direita` (`ΔX/ΔY = 0.335`) e a porta/janela não regrediram.
- Nunca altere `src/scripts/splash/animacao.ts` nesta tarefa (T4 conecta a animação).
- Se precisar subdividir uma malha lida pelo HLR (`dividirGeometriaEmPlano`), subdivida todos os triângulos (não só o topo) para manter a malha manifold sem bordas abertas falsas.
