# Plano: linhas vetoriais com remoção de linhas ocultas (HLR)

Data: 2026-11-23. Base: `docs/pesquisa-renderizacao-linhas-threejs.md` (na `main`; cópia lida pelo coordenador) e `docs/gauntlet/t2/estado.md`.

## Problema
O contorno atual (`EdgesGeometry` → `LineSegments2` + bias de profundidade + `polygonOffset`) produz:
- espículas/dentes pretos de 2–5 px nas quinas (toco de aresta oculta vazando pelo bias + ponta redonda do `LineMaterial`);
- linhas dobradas onde peças se encostam (cada peça desenha a sua aresta; `EdgesGeometry` não deduplica entre malhas);
- linha fina de construção atravessando o vão do W por cima do contorno (`criarLinhaConstrucaoFrontalW`);
- tracinhos cinza no aro branco (provável fresta de T-junction entre topos de peças diferentes);
- quinas convexas arredondadas (sem miter em fat lines).

## Decisão
Faces continuam em WebGL. **Todas as linhas** (contorno preto + construção fina) passam a ser **SVG vetorial** gerado por um módulo de HLR na CPU, desenhado num `<svg>` **por cima** do canvas.

Simplificação válida para este projeto: a câmera é ortográfica e fixa e **nenhuma peça gira** (só translação e um leve squash). Então o conjunto de arestas candidatas de cada peça (vincos + silhuetas) é **constante**; por quadro só muda a visibilidade (quem cobre quem).

## Fases

### F0 — Diagnóstico (sem mudar o visual entregue)
Confirmar as hipóteses da pesquisa, registrando números em `docs/gauntlet/t2/linhas/diagnostico.md`:
1. Bias `0` → os dentes somem? (captura antes/depois de 3 quinas citadas pelos críticos).
2. Contornos ocultos + cor interna em magenta → os tracinhos do aro ficam magenta? (= fresta entre faces).
3. Contagem de segmentos duplicados entre peças em espaço de mundo na pose final.
Reverter os experimentos depois de medir.

### F1 — Módulo HLR `src/scripts/splash/cena/linhas/`
- `arestas.ts`: arestas candidatas por peça, uma vez, em espaço local: vincos (limiar de ângulo) + silhuetas para a câmera fixa (faces vizinhas com orientação oposta à direção de visão; necessárias nas curvas do R) + bordas. Curvas do R: usar uma versão simplificada só para o HLR se `curveSegments: 64` pesar.
- `construcao.ts`: linhas de construção (asteriscos + prolongamentos, mesmas 12 do T0) como arestas "virtuais" que também passam pelo teste de visibilidade (para ficarem atrás do cubo onde o JPG as mostra atrás). Remove `criarLinhaConstrucaoFrontalW`.
- `visibilidade.ts`: por quadro: transformar arestas pelo `matrixWorld` de cada peça → projetar 2D → cortar cada aresta nos cruzamentos 2D com as demais → raio na direção da câmera a partir do ponto médio de cada pedaço contra as malhas, com ε relativo à profundidade da própria aresta. Raycast com `three-mesh-bvh` (dependência nova permitida, só esta; versão estável atual) ou `Raycaster` puro se medir rápido o bastante.
- `encadear.ts`: deduplicar segmentos coincidentes (tolerância em px), remover emendas coplanares entre peças **somente quando encostadas** (na pose final ou quando a distância entre elas < tolerância), fundir colineares, encadear em polilinhas.
- `svg.ts`: escrever dois `<path>` (construção fina `#343432` ~1,45 px embaixo; contorno preto ~5,5 px em cima), `stroke-linejoin: miter`, `stroke-linecap: butt`, `vector-effect: non-scaling-stroke`, coordenadas arredondadas a 0,1 px.
- API: `criarLinhasHLR(pecas, camera, svg)` → `{ atualizar(): void, paraSvgString(): string, destruir() }`. `paraSvgString()` será usado na T5 para gerar a logo final.

### F2 — Integração e limpeza
- `cubo.ts`/`debug.ts` chamam `atualizar()` a cada renderização.
- Remover: `LineSegments2`/`LineMaterial` do contorno, bias `clip.z`, `polygonOffset` das malhas, `criarLinhaConstrucaoFrontalW`, o `<svg>` antigo atrás do canvas, e os ajustes manuais de arestas (`transformar`, `transformarArestasR/W`, `recortarDireitaR` das arestas). As máscaras das **malhas** continuam (regra "à direita do R").
- Faces: se F0 confirmar a fresta de T-junction, alinhar os vértices das emendas do aro (ou unir o aro numa malha na pose final).

### F3 — Desempenho e animação simulada
- Página/modo de teste `/?debug=hlr` que move as 3 peças pelo caminho da coreografia do T0 (W do canto inferior esquerdo, R do inferior direito, quarto de cima), mostrando tempo de `atualizar()` por quadro.
- Meta: média ≤ 4 ms e p95 ≤ 8 ms por quadro no desktop. Se não bater: cache de visibilidade para peças paradas, recalcular só pares de peças que se sobrepõem em 2D, ou 30 Hz para as linhas.

### F4 — Gates e rodada do Gauntlet
- `node tools/gauntlet/t2-rodada.mjs 6`, recortes ampliados antes/depois das quinas citadas nas críticas (furo do R, base do R, cantos da porta/janela, aro superior) e do vão do W.
- Critério: nenhuma espícula, nenhuma linha dobrada, nenhuma linha atravessando face que no JPG está por cima dela; diff% não pode piorar mais que 0,1 p.p. em relação à rodada 5 (2,51%).

## Fora do escopo
- Perfil do W (`w.svg`): bloqueado aguardando decisão do dono.
- Tons das faces internas do W.
- Animação real (T4) e SVG final (T5) — só preparar a API.

## Riscos
- Custo por quadro do HLR não medido (F3 decide).
- Tolerância do encaixe: emendas devem sumir só quando as peças encostam.
- ε do raio: pequeno demais → arestas se escondem atrás da própria face; grande demais → vazam.
