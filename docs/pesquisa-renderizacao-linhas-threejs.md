# Pesquisa: linhas de desenho técnico em Three.js

Data: 2026-11-23. Fontes: código-fonte do three.js r187 (lido em `node_modules/three` 0.187.0 do worktree `splash-t2-cubo`; links para a tag `r187`), especificação OpenGL ES 3.0.6, SVG 2, repositórios de gkjohnson, pmndrs, Omar Shehata e fogleman.
"Medido" indica recorte ampliado de `docs/gauntlet/t2/rodada-5/captura.png`. "Cálculo meu" indica conta feita com as constantes de `src/scripts/splash/cena/constantes.ts`.
Caminhos de código sem link são do worktree `splash-t2-cubo`.

## Resumo

- **Os dentes pretos vêm do teste de profundidade aplicado a uma linha larga.** O `LineMaterial` desenha cada segmento como um retângulo em tela, e todo o traço usa a profundidade da linha central. [LineMaterial.js L241–L257](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L241-L257)
- O bias `clip.z -= 0.0012*clip.w` resolve as quinas côncavas, mas deixa aparecer cerca de 4 px de cada aresta oculta que sai de um vértice visível. A ponta redonda soma mais 2,75 px. Cálculo meu na seção 2.1.
- **Fat lines não têm junção.** `Line2` é só `LineSegments2` com pares de pontos consecutivos. As "junções" são pontas redondas sobrepostas, sem miter. [LineGeometry.js L50–L69](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineGeometry.js#L50-L69), [LineMaterial.js L414–L424](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L414-L424)
- Nenhum bias fixo serve aos dois casos ao mesmo tempo. A visibilidade precisa ser decidida pela linha central, fora do depth buffer.
- **Linhas limpas exigem remoção de linhas ocultas (HLR) em geometria, não em pixels.** Assim faz o `three-edge-projection` (BVH + intervalos visíveis/ocultos). [ProjectionGenerator.js](https://github.com/gkjohnson/three-edge-projection/blob/main/src/ProjectionGenerator.js)
- Com os segmentos visíveis em 2D, o SVG resolve espessura constante e quinas: `stroke-linejoin` começa em `miter` e `stroke-linecap` em `butt`. [SVG 2](https://www.w3.org/TR/SVG2/painting.html)
- **Recomendação minha:** um módulo de HLR na CPU, compartilhado pela animação e pelo SVG final. Todas as linhas (contorno e construção) vão num único `<svg>` **sobre** o canvas. Saem `LineSegments2`, o bias e as remoções manuais de arestas.

## 1. Pipeline atual de linhas

| Camada | Como é feita | Onde |
|---|---|---|
| Contorno preto 5,5 px | `EdgesGeometry(25°)` por peça → `transformar` remove/ajusta arestas à mão → `LineSegments2` com `depthTest: true` e bias `0.0012` em NDC | `contorno.ts`, `pecas.ts` |
| Faces | `MeshLambertMaterial` + `onBeforeCompile`, `polygonOffset(1, 1)` | `materiais.ts` |
| Construção (12 linhas) | `<line>` num `<svg>` **atrás** do canvas; as faces opacas as escondem | `linhas-construcao.ts` |
| Construção frontal do W | `LineSegments2` 1,45 px, bias `0.0006`, `renderOrder = 1` | `criarLinhaConstrucaoFrontalW` em `contorno.ts` |

- São 4 objetos de contorno separados (W, R, fundo-esquerda, fundo-direita), cada um com a própria `EdgesGeometry`. `pecas.ts`
- O W e o fundo-direita geram arestas de uma cópia anterior ao recuo `INSET_QUINA`. O R usa a geometria completa, sem o rebaixo. `pecas.ts`

## 2. Causa provável de cada defeito

### 2.1 Espículas e dentes pretos (2–5 px)

Como o `LineMaterial` funciona (modo `worldUnits: false`, o usado aqui):

- Cada segmento vira um quad deslocado em tela por `linewidth/2` para cada lado. [L222–L253](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L222-L253)
- Nas pontas, o quad avança mais `linewidth/2` além do vértice (`offset += dir`). [L230–L239](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L230-L239)
- Sem `alphaToCoverage`, o fragment shader descarta fora de um semicírculo: a ponta é **redonda**. [L414–L424](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L414-L424)
- Os vértices do quad usam `clipStart` ou `clipEnd` inteiros: toda a largura e a ponta têm a profundidade do ponto da linha central. [L248–L257](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L248-L257)
- `linewidth` é em px CSS. `LineSegments2.onBeforeRender` sobrescreve `resolution` com o viewport do renderer a cada quadro. [LineMaterial.js L545](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L545), [LineSegments2.js L419–L426](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineSegments2.js#L419-L426)

O conflito:

- **Quina côncava** (vale, ex.: `In_back`): as faces vizinhas sobem em direção à câmera. Metade do traço fica atrás delas e o depth test corta. Por isso entrou o bias. `contorno.ts` (comentário de `aplicarBiasProfundidadeLinha`)
- **Aresta oculta presa a um vértice visível** (ex.: aresta de profundidade da quina do furo do R): perto do vértice, ela está menos de `bias` atrás da face da frente e passa no teste. Aparece um toco.
- O `polygonOffset(1, 1)` nas malhas empurra as faces para trás. Ele soma `m × factor + r × units`, em que `m` é a inclinação máxima de profundidade do polígono. Em face quase de perfil, `m` é grande e o vazamento cresce. [ES 3.0.6 §3.6.2](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf), [glPolygonOffset](https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glPolygonOffset.xhtml)

Tamanho do toco (cálculo meu):

- Câmera ortográfica com `near 0.1` e `far 40`. Bias `0.0012` NDC × 39,9 / 2 ≈ **0,024 u** de profundidade, igual ao comentário do código. `camera.ts`, `contorno.ts`
- Direção de visão: `(0,590; 0,550; 0,590)` (azimute 45°, `sen(elev) = 0,5501`). `constantes.ts`
- Aresta que entra na parede por `t` em X fica `t/0,590` atrás da face `X = 0,5`. Ela vaza enquanto `t < 0,0141 u`.
- Um passo de 1 u em X mede 273 px na tela. O toco tem **≈ 3,9 px**. Com a ponta redonda (2,75 px), chega a **≈ 6,6 px**.
- Isso bate com os 2–5 px e com o "bloco 4×4" apontados pelos críticos. `docs/gauntlet/t2/rodada-5/critica.md` (worktree `splash-t2-cubo`)

Mapeamento nos pontos da crítica (medido + geometria dos perfis):

| Ponto (px em 1024) | Aresta que vaza | Origem |
|---|---|---|
| Canto sup. esq. do furo do R `(543, 503)` | Aresta de profundidade em `(Z 0,288; Y 0,312)`, de `X 0,5` a `0,388`. É a interseção de duas faces ocultas (teto e lateral do furo) | `r.svg` `M 212 188`, `ajustarProfundidadeFuroR` |
| Base da haste do R `(541, 758)` | Aresta inferior traseira do W (`Y −0,5`, `Z 0,365`), que termina em `X 0,5`, atrás da lâmina ocre | `transformarArestasW` remove só a aresta da face `X 0,5` |
| Cantos da porta e da janela | Arestas de profundidade dos batentes, ocultas na parede, e pontas redondas de arestas sem vizinha no vértice | `fundo-esquerda.svg`, `fundo-direita.svg` |
| Aro superior `(302, 321)`, `(545, 240)` | Arestas verticais ocultas sob o topo. Vazam ≈ 3,7 px (`t < 0,0132 u`, eixo Y = 283 px/u) | Cálculo meu |

Teste rápido (não feito): bias `0` em `criarMaterialContorno`. Os dentes devem sumir, e as quinas côncavas devem voltar a perder meia espessura.

### 2.2 Linhas sobrepostas e dobradas

- **Aresta duplicada entre peças.** `r.svg` tem `x = 0` (`Z = 0,5`) e `w.svg` tem `x = 1000` (`X = 0,5`). As duas peças geram a vertical `T_front → B_front`. Nenhum `transformar` a remove. São dois `LineSegments2` no mesmo lugar. `r.svg`, `w.svg`, `pecas.ts`
- Com MSAA, dois traços quase coincidentes (pontas em lugares diferentes) somam cobertura. A borda fica mais grossa e as pontas viram calombos. Isto é inferência minha, não medida.
- `EdgesGeometry` só junta arestas dentro da **mesma** geometria. Arestas iguais de geometrias diferentes nunca se fundem. [EdgesGeometry.js L55–L160](https://github.com/mrdoob/three.js/blob/r187/src/geometries/EdgesGeometry.js#L55-L160)
- Arestas sem par (borda aberta, T-junction, vizinha degenerada) são **sempre** emitidas, sem olhar o ângulo. [L148–L160](https://github.com/mrdoob/three.js/blob/r187/src/geometries/EdgesGeometry.js#L148-L160)
- Triângulos degenerados são pulados ([L96–L100](https://github.com/mrdoob/three.js/blob/r187/src/geometries/EdgesGeometry.js#L96-L100)). `limitarEixoGeometria` achata vértices num plano e pode criar esses triângulos. Por isso podem surgir arestas de borda espúrias no fundo-esquerda, que gera contorno **depois** do achatamento. Não confirmado.
- **Linha frontal do W.** É um objeto à parte, com bias próprio (`0.0006`), ponta redonda e `renderOrder` 1. A visibilidade dela não é coordenada com o contorno. Ela termina sobre o centro do traço preto, cruza contornos de porta e janela e só fica abaixo deles por ordem de desenho. `contorno.ts`, `cubo.ts`
- Na referência a linha também cruza a porta. O problema é o encontro com as pontas do contorno, não o trajeto. Medido: recortes da referência e da captura na região `x 270–560, y 330–560`.

### 2.3 Tracinhos cinza no aro branco

- Medido: os tracinhos ficam sobre as **emendas entre topos de peças diferentes**:
  - W/fundo-esquerda em `Z = 0,365` (≈ `(304, 350)–(336, 368)`);
  - fundo-esquerda/fundo-direita em `X = −0,365` (≈ `(543, 255)–(511, 273)`, crítica: `520–545, 245–260`);
  - R/fundo-direita em `Z = −0,365` (≈ `(686, 368)–(718, 386)`, crítica: `680–710, 358–376`).
- **Hipótese A (mais provável):** fresta de rasterização numa T-junction. A regra de "exatamente um fragmento" só vale para aresta comum **com extremidades idênticas**. [ES 3.0.6 §3.6.1](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf)
  - Exemplo: a aresta do topo do W vai até o entalhe (`X ≈ −0,28`). A do topo do fundo-esquerda para em `X = −0,365`. Os vértices não coincidem.
  - Pela fresta aparece a face achatada cinza que fica embaixo. `pecas.ts`
- **Hipótese B:** aresta de contorno oculta logo abaixo do topo, vazando pelo bias.
- Nenhuma das duas foi confirmada. Teste: esconder os contornos e trocar a cor de `uCorInterna` por magenta. Se o tracinho ficar magenta, é A.

### 2.4 Espessura e quinas

- A espessura em tela é constante no modo px CSS, o que está correto. [LineMaterial.js L241–L245](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L241-L245)
- Quinas convexas saem **arredondadas**: duas pontas redondas sobrepostas. Um miter avança `(w/2)/sen(θ/2)` além do vértice; a ponta redonda, só `w/2`. Geometria padrão de stroke; a definição de miter está em [SVG 2](https://www.w3.org/TR/SVG2/painting.html).
- Não há opção de miter no `LineMaterial`. A única outra forma de ponta é a do modo `worldUnits`, que também é arredondada (distância à linha `> 0,5` descarta). [L352–L396](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L352-L396)

## 3. Técnicas de contorno e trade-offs

| Técnica | Linhas internas (vincos) | Sem sobreposição | Quina limpa / miter | Exporta SVG | Custo animado |
|---|---|---|---|---|---|
| `EdgesGeometry` + `LineSegments2` (atual) | Sim | Não (duplica entre malhas) | Não (ponta redonda, oclusão por depth) | Não | Baixo |
| Conditional lines (LDraw) | Silhueta dependente da vista | Não | Não (linha GL de 1 px) | Não | Baixo |
| Inverted hull (`OutlineEffect`) | Não (só silhueta) | Sim | Ruim em malha facetada | Não | Baixo |
| Pós-processo normal + profundidade / ID | Sim | Sim (é pixel) | Razoável, rasterizado | Não | Médio |
| `SVGRenderer` | Sim | Não | Linhas sem oclusão parcial | Sim | Alto |
| HLR em geometria → SVG | Sim | Sim (deduplicado antes) | Sim (`stroke-linejoin`) | Sim | Depende da implementação |

Detalhes, com fonte:

- **Fat lines.** Quad por segmento, pontas redondas, sem junção, oclusão pela profundidade da linha central (seção 2.1). Exemplo oficial: [webgl_lines_fat](https://threejs.org/examples/#webgl_lines_fat).
- **Conditional lines.** O shader projeta dois pontos de controle e descarta a linha quando eles ficam em lados opostos (`sign(d0) != sign(d1)`). [LDrawConditionalLineMaterial.js L68–L90](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/materials/LDrawConditionalLineMaterial.js#L68-L90)
  - O material é `ShaderMaterial` para linhas comuns: 1 px no WebGL. [LineBasicMaterial](https://threejs.org/docs/pages/LineBasicMaterial.html)
  - A versão generalizada de gkjohnson lista "Add support for Line2 objects to display fat lines" como melhoria **pendente**. [conditional-lines](https://github.com/gkjohnson/threejs-sandbox/tree/master/conditional-lines)
  - Serve para a silhueta das superfícies curvas do R, mas não resolve oclusão nem quinas.
- **Inverted hull.** `OutlineEffect` redesenha a malha com `BackSide` e empurra cada vértice pela normal. [OutlineEffect.js L82–L108, L155](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/effects/OutlineEffect.js#L82-L108)
  - Só desenha silhueta.
  - Em malha com vértices duplicados por face (caso do `ExtrudeGeometry`), cada cópia do canto anda numa direção e o casco abre nas quinas. Inferência pelo código, não testada.
- **Pós-processo.** No r187, o `SobelOperatorShader` lê só o canal `.r` da imagem: é borda de luminância, não de normal ou profundidade. [SobelOperatorShader.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/shaders/SobelOperatorShader.js), [exemplo](https://threejs.org/examples/#webgl_postprocessing_sobel)
  - `OutlinePass` (three) e `OutlineEffect` (pmndrs) contornam **objetos selecionados** a partir de máscara e profundidade. Não desenham vincos internos. [OutlinePass.js L39–L65](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/postprocessing/OutlinePass.js#L39-L65), [pmndrs OutlineEffect.js](https://github.com/pmndrs/postprocessing/blob/main/src/effects/OutlineEffect.js)
  - Omar Shehata publicou um pós-processo com buffer de profundidade e de normais, mais FXAA. [webgl-outlines](https://github.com/OmarShehata/webgl-outlines)
  - Limitações relatadas por ele: bordas somem em alguns ângulos, e ajustes de profundidade dependem de near/far. Ele cita: "I wonder if there will always be artifacts like that in a screen-space approach like this." [Fórum three.js](https://discourse.threejs.org/t/how-to-render-full-outlines-as-a-post-process-tutorial/22674)
  - A segunda versão usa **IDs de superfície** no lugar de normais. [Artigo](https://omar-shehata.medium.com/better-outline-rendering-using-surface-ids-with-webgl-e13cdab1fd94) (HTTP 403 na leitura; conteúdo **não confirmado** além do título e do README)
  - Para este projeto: não duplica e tem espessura uniforme, mas é raster (não vira SVG) e precisa engrossar para 5,5 px. Faces coplanares de peças diferentes não geram borda por normal e profundidade, o que é bom para as emendas. Não testado.
- **`SVGRenderer`.** Usa o `Projector`: ordena elementos inteiros (painter) pelo `z` médio da face ou pelo `z` máximo da linha. [Projector.js L289, L349, L971–L990](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/renderers/Projector.js#L971-L990)
  - Uma linha meio escondida fica toda na frente ou toda atrás. Não há HLR.
  - Faces ganham `overdraw` de 0,5 px contra frestas de AA. [SVGRenderer.js L164](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/renderers/SVGRenderer.js#L164)
  - Linhas usam `LineBasicMaterial.linecap`, que começa em `round`. [SVGRenderer.js L603](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/renderers/SVGRenderer.js#L603), [LineBasicMaterial.js L82](https://github.com/mrdoob/three.js/blob/r187/src/materials/LineBasicMaterial.js#L82)
  - Sem sombras, segundo a própria documentação. [SVGRenderer.js](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/renderers/SVGRenderer.js)
- **HLR em geometria.** É a única opção da tabela que dá linhas sem sobreposição **e** quinas de vetor. Ver seção 6.

## 4. Oclusão correta de linhas

- O depth test decide por **pixel**. A linha larga precisa de decisão por **ponto da linha central**. Esse descompasso é a raiz do problema (seção 2.1).
- `polygonOffset` só vale para polígonos com `POLYGON_OFFSET_FILL`. [ES 3.0.6 §3.6.2](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf)
  - As fat lines são triângulos, então poderiam usar `polygonOffset` também. Inferência, não testada.
  - Mesmo assim, o offset depende da inclinação do polígono, não da largura do traço. Não resolve o conflito.
- Bias em clip space (o atual) é constante em profundidade. Ele não distingue "aresta vizinha côncava" de "aresta oculta rasa".
- O modo `worldUnits` já tem uma correção de profundidade própria ("so the line segments overlap neatly"). Ela trata a sobreposição entre segmentos, não a oclusão por faces. [L211–L218](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineMaterial.js#L211-L218)
- **Z-fighting entre arestas coplanares de peças diferentes** não se resolve com offset: as duas arestas têm a mesma profundidade. A solução é ter uma aresta só (seção 5).
- **Alternativa só GPU (proposta minha, não confirmada em fonte):**
  1. Renderizar a profundidade das faces numa textura.
  2. No shader da linha, comparar a profundidade amostrada **no ponto mais próximo da linha central**, e não no pixel do fragmento.
  3. A largura inteira passa ou falha junto. Côncavas ficam inteiras e tocos ocultos somem.
  - Continua sem miter e sem SVG. Só vale se o HLR na CPU for lento demais.

## 5. Sem sobreposição e sem duplicação

- **Deduplicar no espaço do mundo, na pose final.** Para cada segmento, chave = reta suporte (direção normalizada + ponto mais próximo da origem, arredondados). Na mesma reta, unir os intervalos 1D. Proposta minha.
  - `EdgesGeometry` faz algo parecido dentro de uma geometria: hash de posição com 4 casas decimais. [L55, L88–L90](https://github.com/mrdoob/three.js/blob/r187/src/geometries/EdgesGeometry.js#L55-L90)
- **Remover emendas coplanares por regra, não por coordenada fixa.** Uma aresta cujas duas faces vizinhas, já unidas entre peças, são coplanares e da mesma cor não é desenhada. Hoje isso é feito à mão em cada `transformar`, por coordenada. `pecas.ts`
- **Montar polilinhas.** Encadear segmentos visíveis que compartilham ponta (tolerância ~0,01 px em tela). Fundir colineares consecutivos.
  - Em SVG, cada polilinha vira um subpath, e o miter acontece nos vértices internos. [SVG 2](https://www.w3.org/TR/SVG2/painting.html)
  - `Line2` não serve: converte a polilinha em pares independentes, sem junção. [LineGeometry.js L50–L69](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/lines/LineGeometry.js#L50-L69)
- **Pontas.** Onde uma aresta some atrás de outra, o ponto final cai no centro do traço da aresta da frente. Com `butt`, a ponta fica coberta pelo traço da frente. [SVG 2](https://www.w3.org/TR/SVG2/painting.html) (definição de `butt`)
  - Nos vértices com 3 arestas (cantos do cubo), o miter só junta duas. A terceira termina em `butt` dentro do traço. O fechamento exato desse canto precisa ser comparado com a referência. Não testado.
- **Passada única.** Um `<path>` por camada (construção e contorno) e uma cor por camada. A união das formas de stroke de um mesmo elemento é uma forma só. [SVG 2](https://www.w3.org/TR/SVG2/painting.html)
- Construção × contorno: subtrair do intervalo de construção o trecho coincidente com contorno. Desenhar a construção **antes**, para o contorno cobrir os encontros.

## 6. Híbrido: faces em WebGL e todas as linhas em SVG com HLR

### Bibliotecas e abordagens

- **three-edge-projection** (gkjohnson, MIT): "Visible geometry edge projection and flattening based on three-mesh-bvh". [README](https://github.com/gkjohnson/three-edge-projection)
  - Projeta **ao longo do eixo Y** e descarta Y na saída. Para usar a câmera do projeto, girar a cena para a direção de visão virar −Y. [ProjectionGenerator.js](https://github.com/gkjohnson/three-edge-projection/blob/main/src/ProjectionGenerator.js)
  - Padrões: `angleThreshold = 50`, `includeIntersectionEdges = true`, `iterationTime = 30` ms. Devolve `visibleEdges` e `hiddenEdges`. [ProjectionGenerator.js](https://github.com/gkjohnson/three-edge-projection/blob/main/src/ProjectionGenerator.js), [API.md](https://github.com/gkjohnson/three-edge-projection/blob/main/API.md)
  - Método: BVH das arestas contra BVH de cada malha, guardando os intervalos cobertos de cada aresta. [ProjectionGenerator.js](https://github.com/gkjohnson/three-edge-projection/blob/main/src/ProjectionGenerator.js)
  - API em gerador ou promessa. Projetado para trabalho fatiado, não para 60 fps. Desempenho por quadro: **não confirmado**.
  - Instalação documentada só via GitHub: `npm install github:@gkjohnson/three-edge-projection`. [README](https://github.com/gkjohnson/three-edge-projection)
  - `SilhouetteGenerator` usa clipper2-js e "pode ser muito lento". [API.md](https://github.com/gkjohnson/three-edge-projection/blob/main/API.md)
  - Bug lido no código: `generateAsync` sem `signal` lança `TypeError` (`signal.throwIfAborted()`). [ProjectionGenerator.js](https://github.com/gkjohnson/three-edge-projection/blob/main/src/ProjectionGenerator.js)
- **ln** (fogleman, Go): "All of the Paths are chopped up to some granularity and each point is tested by shooting a ray toward the camera." Saída PNG ou SVG. É Go, não roda no navegador sem port. [ln](https://github.com/fogleman/ln)
- **three-mesh-bvh**: acelera raycast. A doc cita 500 raios contra 80 mil polígonos a 60 fps, sem hardware informado. [README](https://github.com/gkjohnson/three-mesh-bvh)
  - `Mesh.raycast` leva o raio ao espaço local por `matrixWorld` invertida. Peças rígidas em movimento não precisam reconstruir nem `refit` o BVH. [Mesh.js L275–L276](https://github.com/mrdoob/three.js/blob/r187/src/objects/Mesh.js#L275-L276)

### Viabilidade para centenas de arestas a 60 fps

Algoritmo proposto (meu; não testado, sem benchmark):

1. **Arestas candidatas.** Uma vez por peça, em espaço local: vincos (`EdgesGeometry` ou direto dos perfis SVG), bordas e linhas de construção. A cada quadro, somar as **arestas de silhueta**, cujas duas faces vizinhas apontam para lados opostos em relação à câmera. Elas são necessárias nas curvas do R. [conditional lines](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/materials/LDrawConditionalLineMaterial.js#L68-L90)
2. **Projeção.** Projetar para 2D com a câmera ortográfica fixa.
3. **Corte.** Cortar cada aresta nos cruzamentos 2D com as outras. A visibilidade só muda nesses pontos.
4. **Teste.** Para o ponto médio de cada pedaço, um raio no sentido da câmera contra as malhas (BVH). Ignorar acertos dentro de um ε da própria profundidade.
5. **Saída.** Deduplicar e encadear (seção 5), depois escrever 2 `<path>`.

- Ordem de grandeza (cálculo meu): 300 arestas dão até ~45 mil pares 2D (com grade ou BVH, bem menos) e alguns milhares de raios. Isso parece caber em poucos ms, mas **não foi medido**.
- O R com `curveSegments: 64` multiplica as arestas laterais curvas. Pode ser preciso simplificar as curvas só para o HLR. `pecas.ts`
- Escrever 2 atributos `d` por quadro é barato. O custo de rasterizar o SVG na composição: **não medido**.
- O `<svg>` precisa ficar **sobre** o canvas. Os traços, centrados nas bordas das faces, também cobrem o serrilhado do MSAA nas bordas WebGL. Inferência.

## 7. Montagem animada

- **A deduplicação depende da pose.** Arestas só coincidem no encaixe final. Durante o movimento, cada peça tem o contorno completo. Proposta: marcar na pose final as arestas "emenda" e esmaecê-las nos últimos quadros do encaixe.
- **As remoções manuais atuais estão erradas fora da pose final.** Exemplo: `transformarArestasW` apaga a vertical traseira `X 0,5`/`Z 0,365` sempre, mesmo com o R ainda longe. `pecas.ts`
- **O bias vaza entre peças.** Aresta de uma peça até 0,024 u atrás da face de outra aparece. No fim do encaixe (folga de 0,0008 u), arestas da peça de trás "acendem" de uma vez. Cálculo meu.
- **Faces coplanares no encaixe** dão z-fighting e frestas de T-junction (seção 2.3). Com HLR, o ε do raio decide. No quadro final, o SVG substitui tudo.
- **Silhuetas mudam com a rotação.** O W gira, então as silhuetas são recalculadas a cada quadro. Vincos fixos podem ficar em cache.
- **Máscaras em espaço local** (`wrEstaADireitaDoR`, `recortarSegmentoDireitaR`) acompanham a peça. São regras de 2D da logo; com HLR, a parte coberta pelo R sai sozinha e a máscara de arestas pode ser dispensada. A da malha continua. Não testado. `materiais.ts`, `contorno.ts`
- **Troca para o SVG final.** Se as linhas da animação já vêm do mesmo HLR em SVG, a troca no último quadro só muda as faces. As linhas ficam iguais.

## 8. Recomendação priorizada (RECOMENDAÇÃO MINHA, não é fato da fonte)

### Passos

1. **Diagnóstico em 1 rodada, sem mudar o visual.** Confirmar as causas antes de reescrever.
   - Bias `0`: os dentes somem? (seção 2.1)
   - Contornos ocultos e `uCorInterna` magenta: os tracinhos do aro ficam magenta? (seção 2.3)
   - Contar segmentos duplicados entre peças em espaço do mundo, com hash da reta suporte. A vertical `T_front` deve aparecer 2 vezes.
2. **Módulo de HLR na CPU** (`cena/linhas-hlr.ts`), usado pela animação e pelo SVG final.
   - Arestas candidatas por peça, de geometria **sem** `limitarEixoGeometria` nem lâminas auxiliares.
   - Silhuetas por quadro.
   - Linhas de construção como arestas virtuais, incluindo a frontal do W.
   - Visibilidade por corte 2D + raio no ponto médio com `three-mesh-bvh`.
   - Dedup por reta suporte, regra de emenda coplanar e encadeamento em polilinhas.
   - Recalcular só quando alguma peça se mover.
3. **Todas as linhas num `<svg>` sobre o canvas.**
   - `<path>` de construção (1,45 px, `butt`) embaixo e `<path>` de contorno (5,5 px, `stroke-linejoin: miter`, `butt`) em cima.
   - Remover `LineSegments2`, `LineMaterial`, `aplicarBiasProfundidadeLinha`, `polygonOffset` das malhas, `criarLinhaConstrucaoFrontalW`, o truque do SVG atrás e os `transformar` / `segmentosExtras` por coordenada.
   - Os ajustes de profundidade (furo 112, perna 196, porta 70) passam a ser feitos na geometria das malhas, que o HLR lê.
4. **Faces sem fresta.** Se a hipótese A se confirmar: dividir as arestas do topo para os vértices coincidirem nas emendas, ou criar uma malha única do aro para a pose final.
5. **SVG do quadro final.** Gerar com o mesmo módulo, na build (página aberta no Playwright, já usado nos gates) ou no navegador.
   - Faces: polígonos projetados por peça, ordenados ou recortados. three-edge-projection e `SVGRenderer` não fazem faces coloridas com sombra. Esta parte fica em aberto.
   - Validar com `pixelmatch` contra o último quadro WebGL + SVG.

### Riscos

- Desempenho por quadro do HLR: **não medido**. Plano B: HLR só nos quadros-chave, ou a variante GPU da seção 4.
- ε em contato e faces coplanares: valor errado gera piscar de arestas no encaixe.
- Curvas do R: muitas arestas pequenas. A silhueta por facetas pode serrilhar a curva.
- Cantos com 3 arestas: miter de SVG junta só 2. Comparar com a referência.
- Depender de pacote instalado do GitHub (`three-edge-projection`) em vez do npm. Alternativa: implementar o HLR simples acima só com `three-mesh-bvh`.
- Mudança grande no meio do Gauntlet T2. Fazer numa rodada só, com captura antes e depois, sem misturar com a falha do W.

## Não verificado

- Hipóteses A e B dos tracinhos cinza (seção 2.3): nenhum teste foi feito.
- Que a vertical `T_front` seja desenhada duas vezes: deduzido dos perfis e do código, não contado.
- Que zerar o bias elimine os dentes: previsto pelo cálculo, não executado.
- Desempenho de three-edge-projection ou do HLR proposto a 60 fps: sem benchmark.
- Conteúdo do artigo de surface IDs de Omar Shehata (HTTP 403); só título, README e fórum.
- Se three-edge-projection roda em Node sem navegador: não verificado.
- Comportamento do inverted hull em `ExtrudeGeometry`: inferido do shader, não renderizado.
- Seções 4 (variante GPU), 5, 6 (algoritmo e custo), 7 e 8: propostas minhas, sem execução.
