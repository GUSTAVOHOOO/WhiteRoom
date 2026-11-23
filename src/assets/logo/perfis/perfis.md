# Perfis Planos SVG — Logo WhiteRoom (T1)

Fonte de verdade visual: `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (`1024 × 1024 px`).
Todos os perfis usam `viewBox="0 0 1000 1000"` (lado do cubo = `1000` unidades), um único `<path fill-rule="evenodd" ... />`, sem estilos, grupos ou transformações, com coordenadas inteiras ou `.5`. Subcaminhos de abertura (buracos) têm orientação anti-horária (oposta ao contorno externo horário) para compatibilidade garantida com `fill-rule="evenodd"` e com `SVGLoader.createShapes()` do Three.js.

## 1. Sistema de coordenadas 3D e lado de visualização de cada arquivo

Cubo ocupando `[0, 1000]³` (eixo `X` para frente-direita, `Y` para cima, `Z` para frente-esquerda; câmera ortográfica no quadrante `+X, +Y, +Z` olhando para o centro do cubo):

| Arquivo | Parede no cubo 3D | Plano retificado | Lado de visualização do SVG | Origem `(0, 0)` → `(1000, 1000)` | Direção de extrusão (`t = 135`) |
|---|---|---|---|---|---|
| `w.svg` | Frontal esquerda (W, face externa `#171717`) | `Z = 1000` (externa) | **Vista de fora** (`+Z → -Z`) | `(0, 1000, 1000)` → `(1000, 0, 1000)` | `Z: 1000 → 865` (`-Z`) |
| `r.svg` | Frontal direita (R, face externa `#CD9016`) | `X = 1000` (externa) | **Vista de fora** (`+X → -X`) | `(1000, 1000, 1000)` → `(1000, 0, 0)` | `X: 1000 → 865` (`-X`) |
| `fundo-esquerda.svg` | Traseira esquerda (quarto branco) | `X = 135` (interna) | **Vista de dentro** (`+X → -X`, mesma orientação do `r.svg`) | `(135, 1000, 1000)` → `(135, 0, 0)` | `X: 135 → 0` (`-X`) |
| `fundo-direita.svg` | Traseira direita (quarto branco) | `Z = 135` (interna) | **Vista de dentro** (`+Z → -Z`, mesma orientação do `w.svg`) | `(0, 1000, 135)` → `(1000, 0, 135)` | `Z: 135 → 0` (`-Z`) |

### Por que as paredes do fundo são vistas de dentro
No JPG só enxergamos as faces **internas** das duas paredes do fundo (`X = t` para `fundo-esquerda` e `Z = t` para `fundo-direita`). Mantendo a visualização **de dentro** (direção da câmera), tanto a conferência visual frente-a-frente quanto a re-projeção isométrica ficam sem espelhamento horizontal (determinante positivo na matriz afim), e na montagem Three.js `fundo-esquerda` usa a mesma rotação de `r.svg` e `fundo-direita` usa a mesma rotação de `w.svg`.

## 2. Pontos medidos no JPG e transformação afim

As arestas externas do cubo, linhas de construção e bordas internas do topo foram medidas por regressão linear robusta (RANSAC) sobre os centros dos traços pretos em `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (`scripts/logo/measure.mjs`, erro máximo `< 0,68 px`):

### Vértices medidos (em pixels do JPG `1024 × 1024`)
- `T_back`  (topo-fundo): `(511.45, 237.22)`
- `T_left`  (topo-esquerda): `(272.15, 368.98)`
- `T_right` (topo-direita): `(750.77, 368.73)`
- `T_front` (topo-frente): `(511.47, 500.49)`
- `B_left`  (base-esquerda): `(272.15, 656.47)`
- `B_right` (base-direita): `(750.77, 656.22)`
- `B_front` (base-frente): `(511.47, 787.98)` (medido diretamente pela interseção das linhas de construção inferiores: `(511.46, 787.97)` — discrepância de `0,01 px`)
- `In_back` (quina interna superior de fundo): `(512.12, 272.82)`
- `In_right` (quina interna superior direita): `(685.84, 368.77)`

### Vetores de base da projeção ortográfica
- `uX` (`+X`, lado `1000`): `(+239.32, +131.51) px` (inclinação `+0.5495`)
- `uZ` (`+Z`, lado `1000`): `(-239.30, +131.76) px` (inclinação `-0.5506`)
- `uV` (`-Y`, vertical p/ baixo, lado `1000`): `(0.00, +287.49) px`
- Parâmetros implícitos da câmera: azimute `45.0°`, elevação `arcsin(0.5500) = 33.37°`. A altura vertical projetada (`287.49 px`) é `1,7%` maior que a de um cubo perfeito nessa elevação (`282.64 px`).

### Matrizes afins SVG `matrix(a b c d e f)` (de `0..1000` para pixels `1024 × 1024`)
- `w.svg`: `matrix(0.239320 0.131510 0.000000 0.287490 272.150000 368.980000)`
- `r.svg`: `matrix(0.239300 -0.131760 0.000000 0.287490 511.470000 500.490000)`
- `fundo-esquerda.svg` (plano `X = 135`): `matrix(0.239300 -0.131760 0.000000 0.287490 304.458200 386.733850)`
- `fundo-direita.svg` (plano `Z = 135`): `matrix(0.239320 0.131510 0.000000 0.287490 479.144500 255.007600)`

As imagens retificadas correspondentes estão em `docs/logo/retificado/{w,r,fundo-esquerda,fundo-direita}.png` (e os dados em `docs/logo/retificado/geometria.json`).

## 3. Espessura de parede adotada

- **Espessura adotada: `135` unidades** (`13,5%` do lado de `1000`).
- Medições independentes na borda superior do JPG:
  - Deslocamento vertical `T_back → In_back` sobre diagonal superior (`263.27 px`): `35.60 / 263.27 = 0.1352` (`135.2`)
  - Deslocamento horizontal `In_right`: `0.1356` (`135.6`)
  - Distância entre arestas externa e interna na parede fundo-esquerda (`L_TL → L_inTL`): `0.1355` (`135.5`)
  - Distância na parede fundo-direita (`L_TR → L_inTR`): `0.1348` (`134.8`)
  - Distância na parede R (`L_MR → L_inMR`): `0.1368` (`136.8`)
- Nota sobre as ombreiras internas das aberturas: no JPG, o sombreado interno das ombreiras da porta (`fundo-esquerda`) e da janela (`fundo-direita`) foi ilustrado um pouco mais estreito (`~70` e `~81` unidades) do que a espessura real do topo (`135`). Em 3D com parede uniforme de `135`, essas ombreiras ficarão naturalmente mais profundas que na ilustração — mantivemos `135` para consistência estrutural da parede.

## 4. Decisões geométricas por peça e tratamento de ambiguidades

### `w.svg`
- Contorno fechado puramente poligonal (12 vértices), sem buracos.
- Bordas `x = 0`, `x = 1000`, `y = 0` (nas duas hastes) e `y = 1000` (nos dois pés) batem exatamente nos limites do quadrado `0..1000`.
- **Assimetria sutil do JPG preservada**: no JPG o vale esquerdo (`y = 681`) é mais baixo que o direito (`y = 635`), o pico central superior fica em `x = 505.5` e o vértice inferior em `x = 488`. Optou-se por preservar exatamente a geometria do JPG em vez de forçar simetria artificial, que deslocaria os traços em até `46` unidades (`~13 px`).
- **Quina da frente (`W ∩ R`)**: ambos os perfis planos `w.svg` (em `x = 1000`) e `r.svg` (em `x = 0`) encostam na aresta frontal do cubo para que cada face feche sem fresta e coincida integralmente com o JPG. Na extrusão 3D, a coluna de quina `[865..1000] × [865..1000]` pertence ao `W`; o volume do `R` deve recuar/recortar internamente essa coluna (ou usar offset mínimo no interior) preservando a face externa ocre do `R` a partir de `x = 0`.

### `r.svg`
- Contorno externo horário + buraco interno anti-horário (bojo do R).
- Todas as medidas foram tomadas nos **centros dos traços pretos** da borda do R (largura de traço no JPG ≈ `22–26` unidades no espaço `1000`, ou `~5,5 px`), garantindo que a face encoste em `x = 0`, `y = 0`, `y = 1000` e no vértice `(1000, 1000)`.
- **Bojo externo**: arco elíptico superior `A 340 336 0 0 1 1000 336` (praticamente circular, tangente a `y = 0` em `x = 660` e a `x = 1000` em `y = 336`) seguido por uma única Bézier cúbica inferior `C 1000 560 845 595 735 635` até a junção com a perna diagonal (`erro médio = 3,2 u ≈ 0,8 px`). O centro do traço no extremo direito do bojo no JPG está em `x ≈ 996` (a borda externa do traço toca `x = 1000`); ajustamos a tangente para `x = 1000` (`+0,96 px`) para coincidir com a aresta do cubo.
- **Bojo interno**: altura `y = 188..450` com haste alinhada à haste inferior em `x = 212` e arco semicircular/elíptico `A 128 131 0 0 0 655 188`.

### `fundo-esquerda.svg`
- Parede inteira `0..1000` com abertura tipo **porta** (`x = 345..605`, topo em `y = 325`, aberta até a base `y = 1000`).
- **Ambiguidade na base da porta**: no JPG, a região inferior da porta fica ocluída pelo `W`, exceto por uma pequena fresta à direita da ombreira (`x = 605..646`, `y = 800`), onde há um pequeno traço horizontal cinza/preto e um triângulo branco abaixo dele. Como `y = 800` está `200` unidades acima da base real do cubo (`y = 1000`, totalmente atrás do `W`) e o traço sai para a *direita* da porta (não formando peitoril), trata-se de uma inconsistência da ilustração com a altura interna da parede. Adotou-se porta padrão indo até `y = 1000` sem inventar recortes extras.

### `fundo-direita.svg`
- Parede inteira `0..1000` com abertura retangular tipo **janela** (`x = 310..690`, `y = 175..475`).
- Topo (`y = 175`), lateral esquerda (`x = 310`) e peitoril inferior (`y = 475`, confirmado pelo vértice do chanfro de profundidade em `(392, 398)`) são diretamente visíveis e medidos no JPG.
- **Lateral direita ocluída**: a partir de `x ≈ 655` (no topo `y = 175`), a janela fica completamente escondida atrás da parede `R`. Adotou-se `x = 690` por simetria exata dentro do vão interno útil da parede (`[135, 865]`, centro em `x = 500`: `500 - 310 = 190` → `500 + 190 = 690`), deixando pilares iguais de `175` unidades em ambos os lados e garantindo que a borda direita permaneça 100% ocluída atrás do `R` na vista do JPG.

## 5. O que foi ignorado das pranchas `Gemini_Generated_Image_*.png`

- **`Gemini_Generated_Image_tqssj1tqssj1tqss.png` ("Anatomia e detalhes construtivos")**: ignorada a "porta de entrada no W" inventada dentro do entalhe inferior do W (não existe no JPG), a cor ocre `#C38816` (o JPG usa `#CD9016`) e o desalinhamento das aberturas internas no diagrama de linhas.
- **`Gemini_Generated_Image_z6eu54z6eu54z6eu.png` (vistas `FRONT-RIGHT`, `BACK-RIGHT`, `BACK-LEFT`, `TOP VIEW`, `BOTTOM VIEW`)**: ignoradas todas as aberturas inventadas nas vistas traseiras que contradizem o JPG e entre si — em especial a "porta + janela empilhadas" na parede `fundo-direita` (`FRONT-RIGHT`/`BACK-RIGHT`), o vão gigante quase quadrado na parede `fundo-esquerda` (`BACK-LEFT`), e os entalhes incoerentes nas vistas de topo e base.
