# T5 Rodada 3 — Notas: Favicon de 16 px com Grade Própria

Esta rodada corrige **exclusivamente a falha nº 1** da crítica da rodada 2 (`docs/gauntlet/t5/rodada-2/critica.md`): a perda de legibilidade em `16×16 px` (`public/favicon.svg` e entrada `16×16` de `public/favicon.ico`). Animação 3D, troca `3D → SVG`, voo, pouso, `pular()`, `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, placa (`#FAFAF8`, `rx = 21%`, borda `#E4E3DF`), entradas `32×32` e `48×48` do `.ico`, ícones `180`/`192`/`512`/`maskable` e `site.webmanifest` permaneceram **intactos (0 bytes alterados em `src/` e nos demais 7 ativos gerados)**.

## 1. Diagnóstico e correção no gerador (`tools/gauntlet/gerar-logo-svg.mjs`)

Na rodada 2, a versão simplificada era projetada apenas em `viewBox="0 0 32 32"` com coordenadas ímpares (`x = 7, 13, 19, 25`), `y` em meio-pixel (`2,5..29,5`) e traços escuros sobrepostos (`contorno-r` + `espinha` em `x = 16`, além de `stroke-width="1"` nos dois lados do aro branco de `2 px`). Ao reduzir para `16×16`, a entrada `16×16` do `.ico` ficava com **0 pixels `#CD9016`** (todo o R virava marrom-oliva `#835F16`/`#7D683E`), **0 pixels `#FFFFFF`** no aro do topo e o vão do W fechado num borrão cinza.

Na rodada 3, o gerador extrai a geometria simplificada única do 3D em `extrairGeometriaFaviconSimplificado(camadas)` e deriva duas saídas:

1. **Grade dedicada `16×16` (`derivarGradeFavicon16`) — 100% derivada dos polígonos 3D (nenhum vértice desenhado à mão)**:
   - Todos os vértices do cubo caem em **coordenadas inteiras exatas da grade `16×16`** (`FAVICON_16_LADO = 16`, margem `8%`, deslocamento vertical `FAVICON_16_Y_OFFSET = 0,55` que enquadra cubo + moldura externa do topo exatamente nas linhas `y = 1..14`, dentro da placa `0..16`).
   - **Sem contorno escuro sobre o R nem sobre a espinha**: o R ocupa as colunas `8..13` em `#CD9016` puro, encostando diretamente na haste direita do W (coluna `7` em `#171717`) em `x = 8` sem sobreposição. Uma invariante geométrica mantém o vértice inferior do furo do R (`rFuro`) pelo menos `1 px` acima do recorte da perna (`y <= yRecorteR - 1`), garantindo barra inferior sólida de `#CD9016` e furo claro `#FAFAF8` fechado nos quatro lados (`4 px` internos: `(11,7)`, `(10,8)–(11,8)` e `(9,9)`, ou seja, largura `2×1` horizontal com extensão diagonal).
   - **W em colunas inteiras distintas**: haste esquerda na coluna `2`, vão esquerdo aberto na coluna `3` (`5 px` claros contínuos em `y = 5..9`), pico central nas colunas `4–5` (com `#FAFAF8` aberto embaixo em `(4,11)`), vão direito aberto na coluna `6` (`6 px` claros contínuos em `y = 5..10`) e haste direita na coluna `7`.
   - **Aro superior `#FFFFFF` contínuo e separado do quarto**: em vez de aplicar traço preto por cima do aro branco (o que o transformava em cinza), `topoMolduraGrid` desloca a crista externa traseira (`esquerda → topo → direita`) `1 px` para cima e a desenha **atrás** de `interna-simplificada` e `topo`. O aro branco fica contínuo em `#FFFFFF` puro (`17 px` de `1–2 px` de espessura), emoldurado por `#171717` contra a placa `#FAFAF8` por fora e separado do interior do quarto em `#C6C5C1` (cor `sombra` da paleta oficial) por dentro.

2. **Rasterização chapada da paleta para a entrada `16×16` do `favicon.ico` (`rasterizarFavicon16FlatPng`)**:
   - Renderiza a mesma placa arredondada `#FAFAF8` (`rx = 21%`, borda `#E4E3DF`, cantos externos transparentes com `alpha = 0` em `(0,0)`) e preenche os polígonos da grade `16×16` por amostragem determinística no centro exato de cada pixel `(x + 0,5, y + 0,5)` com **cores chapadas exatas da paleta** (`#171717`, `#C6C5C1`, `#FFFFFF`, `#CD9016`, `#FAFAF8`).
   - Auditoria pixel a pixel (`metricas.json → favicon.pixelAudit16`):
     - Cor dominante do R: **`#CD9016`** (`25 px` puros; era `0 px` na rodada 2).
     - Cor dominante do W: **`#171717`** (`24 px` puros no W; `36 px` totais incluindo a moldura externa do topo).
     - Aro superior branco: **`17 px`** em `#FFFFFF` puro (era `0 px` na rodada 2).
     - Vãos abertos do W: **`5 px`** na coluna `3` e **`6 px`** na coluna `6` em `#C6C5C1`.
     - Furo claro do R: **`4 px`** internos em `#FAFAF8` (`(11,7)`, `(10,8)`, `(11,8)`, `(9,9)`), totalmente cercados por `#CD9016`.

3. **Entrada `32×32` do `favicon.ico` preservada**:
   - `montarFaviconSimplificado32(geom)` mantém bit-a-bit a mesma entrada `32×32` da rodada 2 (`1.374 B`), assim como a entrada `48×48` completa (`2.656 B`), garantindo ausência de regressão nos tamanhos maiores do `.ico`.

## 2. Escolha de `public/favicon.svg` (decidida pelos prints)

Comparamos no print (`docs/gauntlet/t5/rodada-3/favicon.png` e testes em Chromium + Sharp em `16×16` e `32×32`) as duas alternativas para `public/favicon.svg`:

- **Escolha adotada: `viewBox="0 0 16 16"` com coordenadas inteiras da grade `16×16` e `shape-rendering="geometricPrecision"`** (`0,81 KB` / `827 B`, redução de `36%` sobre os `1.297 B` da rodada 2).
- **Justificativa pelo print**:
  1. Matematicamente, uma grade `32×32` com todas as coordenadas pares sem traços sobrepostos produz os mesmos pixels que `viewBox="0 0 16 16"` com coordenadas inteiras — tanto em `16 px` (`1×`) quanto em `32 px` (`2×`) —, porém `viewBox="0 0 16 16"` é mais enxuto (`827 B`), explícito na grade de `16` e sem risco de coordenadas ímpares voltarem.
  2. Em `16 px` (aba `1×`), `favicon.svg` elimina completamente o marrom-oliva do R, mantém o aro branco contínuo e deixa ambos os vãos do W abertos; em `32 px` (aba `2×` HiDPI, mostrado em `4×` no painel inferior direito de `favicon.png`), escala de forma nítida e limpa para barras inteiras de `2 px`, com `#CD9016` saturado, furo do R amplo e aro branco íntegro.
  3. Testamos também `shape-rendering="crispEdges"` no `favicon.svg`, mas no rasterizador `librsvg`/`sharp` o critério de borda de `crispEdges` fecha os vãos do W em um bloco preto contínuo nas linhas `9–11`; manter `geometricPrecision` no `favicon.svg` e usar o raster chapado determinístico na entrada `16×16` do `.ico` deu o melhor resultado nos dois contextos.

## 3. Tamanhos dos arquivos gerados (9/9 reprodutíveis byte-a-byte)

| Arquivo | Tamanho | Observação vs Rodada 2 |
|---|---|---|
| `src/assets/logo/whiteroom-logo.svg` | `7,55 KB` (`7.732 B`) | Inalterado (`0 B` diff) |
| `src/assets/logo/whiteroom-logo-header.svg` | `6,81 KB` (`6.971 B`) | Inalterado (`0 B` diff) |
| `public/favicon.svg` | `0,81 KB` (`827 B`) | Novo `viewBox="0 0 16 16"` em inteiros (era `1.297 B`) |
| `public/favicon.ico` | `4,28 KB` (`4.386 B`) | Entrada `16×16` flat-palette (`302 B`) + `32×32` (`1.374 B`) + `48×48` (`2.656 B`) (era `4.729 B`) |
| `public/apple-touch-icon.png` | `7,46 KB` (`7.634 B`) | Inalterado (`0 B` diff) |
| `public/icon-192.png` | `10,30 KB` (`10.548 B`) | Inalterado (`0 B` diff) |
| `public/icon-512.png` | `28,80 KB` (`29.493 B`) | Inalterado (`0 B` diff) |
| `public/icon-maskable-512.png` | `21,17 KB` (`21.676 B`) | Inalterado (`0 B` diff) |
| `public/site.webmanifest` | `0,52 KB` (`528 B`) | Inalterado (`0 B` diff) |

## 4. Métricas do gate (`docs/gauntlet/t5/rodada-3/metricas.json`)

- **`astro check`**: OK (`11,53 s`) · **`astro build`**: OK (`5,08 s`) · **Console**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Reprodutibilidade do gerador**: **9/9 ativos byte-a-byte idênticos**, sem gradientes/filtros/imagens.
- **Fidelidade SVG 1024×1024 vs T2 R7**: **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,5%`).
- **Troca 3D (`2,59 s`) → SVG (`2,61 s`)**: Desktop **`0,0000%`** (`0 px`) · Mobile **`0,0022%`** (`65 px`, meta `≤ 0,5%`).
- **Voo, fade do fundo e recorte 4× do header**: fundo em `2,85 s` = **`0,50`**; diff pouso↔header = **`0,0319%`** (`1 / 3.136 px`).
- **Pose final T4 (`2,4 s` vs T2 R7)**: **`0,0000%`** (`0 px`, meta `≤ 0,3%`).
- **Desempenho HLR médio**: Desktop **`0,880 ms`** · Mobile **`1,130 ms`** (meta `≤ 4,0 ms`).
- **Testes de fluxo, regressão e favicons**: **11/11 OK** — HTTP 200 nas 7 rotas, 4 links no `<head>`, ausência de `prefers-color-scheme`, auditoria pixel-a-pixel do `16×16` OK (`corDominanteR=#CD9016`, `corDominanteW=#171717`, `pxRPuros=25`, `pxWPuros=24`, `pxTopoBrancos=17`, `pxVaoWCol3=5`, `pxVaoWCol6=6`, `pxFuroR=5` na região do miolo), cantos transparentes/opacos corretos.

## 5. Evidência visual principal

- `docs/gauntlet/t5/rodada-3/favicon.png`: mantém os 3 fundos (`#FAFAF8`, `#FFFFFF`, `#202124`), a simulação de aba `16 px` (`favicon.ico` e `favicon.svg`) e os 7 tamanhos (`16`/`32`/`48` em `4×` nearest, `180`, `192 any`, `512 any`, `512 maskable`), e acrescenta na base o painel de **comparação 8× nearest-neighbor (`128×128`)** colocando lado a lado o `16×16` da rodada 2 e o `16×16` final da rodada 3 (em claro e escuro), mais `favicon.svg` em `16 px (8×)` e `32 px (4×)`.
