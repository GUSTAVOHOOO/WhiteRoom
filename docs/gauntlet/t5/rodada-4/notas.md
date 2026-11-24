# T5 Rodada 4 — Notas: `favicon.svg` Nítido em 16 px e em 32 px

Esta rodada corrige a **falha nº 1** da crítica da rodada 3 (`docs/gauntlet/t5/rodada-3/critica.md`), retornando `public/favicon.svg` para `viewBox="0 0 32 32"` com geometria simplificada derivada do 3D e alinhada à grade par / inclinação isométrica exata `2:1`, mantendo nítidos tanto `16×16` quanto `32×32` no Chromium real.

Animação 3D, troca `3D → SVG`, voo, pouso, `pular()`, `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, placa (`#FAFAF8`, `rx = 21%`, borda `#E4E3DF`), entrada `16×16` (`302 B`) e entrada `48×48` (`2.656 B`) de `public/favicon.ico`, ícones `180`/`192`/`512`/`maskable` e `site.webmanifest` permaneceram **intactos (`0 B` alterados em `src/` e nos demais 7 ativos)**. A entrada `32×32` do `.ico` também foi regenerada a partir do novo `favicon.svg` 32×32 (`911 B`), removendo a aglutinação nas quinas do aro e o traço duplicado na ponta direita sem tocar na entrada `16×16` nem na `48×48`.

## 1. Correção no gerador (`tools/gauntlet/gerar-logo-svg.mjs`)

Em `derivarGeometriaFavicon32(geom)` e `montarFavicon32Svg(geom32)`, o gerador deriva `public/favicon.svg` diretamente dos polígonos 3D simplificados de `extrairGeometriaFaviconSimplificado(camadas)` (sem janela traseira, porta ou divisórias finas — nenhum vértice desenhado à mão):

1. **Bordas retas em coordenadas pares e diagonais isométricas exatas `2:1`**:
   - Quadro isométrico externo do cubo derivado dos extremos reais de `topoClean`, `wClean` e `rExtClean`: topo `(16, 4)`, lateral esquerda `(4, 10)`, lateral direita `(28, 10)`, frente `(16, 16)`, bases `(4, 24)`, `(16, 30)` e `(28, 24)` — todos pares, com `Δy = ±0,5·Δx` exato.
   - Paredes verticais do `W` e do `R` em coordenadas pares (`x = 4, 6, 14, 16, 18, 24, 28`), caindo exatamente sobre a grade de pixels quando o navegador reduz para `16×16`.
2. **Aro superior branco contínuo sem fenda nem traço duplicado**:
   - `contorno-topo` (`FAVICON_32_CONTORNO_TOPO_H = 2,5 px`, `(4, 7.5) → (16, 1.5) → (28, 7.5)`) é desenhado **atrás** do aro branco, mantendo a cumeeira escura nítida em `16×16` sem vazar para a borda superior da placa (`y >= 1,5 > 0,9`).
   - O aro branco `#FFFFFF` (`FAVICON_32_RIM_H = 3,5 px`) mantém `12 px` próximos de `#FFFFFF` no Chromium em `16×16` (era `2` na rodada 3 e `0` na rodada 2), separado do interior do quarto em `#C6C5C1` sem traço escuro interno nas quinas.
   - O ombro superior do `R` acompanha exatamente a diagonal `2:1` inferior do aro (`(16, 16) → (26, 11)`) até o encontro com a curva superior (`Q28 10.5 28 14`), eliminando tanto a fenda da rodada 3 quanto o traço duplicado da rodada 2.
3. **`R` em `#CD9016` puro com curva superior e furo claro amplo**:
   - Nenhum contorno escuro sobreposto (`contorno-r` e `espinha` removidos).
   - Curva suave no topo e bojo externo (`Q28 10.5 28 14 L28 16.5 Q28 19 25 20.5`), pé direito em vértices pares `2:1` (`(24, 26) → (28, 24)`).
   - Furo claro com parede vertical em `x = 18` (par), altura `3,5 px` e curva interna até `x = 24` (`13 px` claros no Chromium em `32×32`, bem acima de `2×2`, e `4 px` claros em `16×16`).
4. **`W` em `#171717` com vãos abertos em `16×16` e `32×32`**:
   - Hastes em `x = 4..6` e `x = 14..16`, pico central em `(10, 16)`, base interna em `(10, 22)` e vãos abertos com `18 px` (esquerdo) e `16 px` (direito) claros em `32×32` (`10 px` claros nas colunas `3` e `6` em `16×16`).
5. **Placa preservada intacta**: `#FAFAF8`, `rx = 21%` (`rx="6.27"`), borda `#E4E3DF` (`stroke-width="0.9"`), sem `prefers-color-scheme`.

## 2. Tamanhos dos arquivos gerados (9/9 reprodutíveis byte-a-byte)

| Arquivo | Tamanho | Observação vs Rodada 3 |
|---|---|---|
| `src/assets/logo/whiteroom-logo.svg` | `7,55 KB` (`7.732 B`) | Inalterado (`0 B` diff) |
| `src/assets/logo/whiteroom-logo-header.svg` | `6,81 KB` (`6.971 B`) | Inalterado (`0 B` diff) |
| `public/favicon.svg` | `0,92 KB` (`944 B`) | Novo `viewBox="0 0 32 32"` par + `2:1` + curva R (era `827 B` em R3 e `1.297 B` em R2) |
| `public/favicon.ico` | `3,83 KB` (`3.923 B`) | Entrada `16×16` **idêntica à R3** (`302 B`) + `32×32` novo (`911 B`) + `48×48` inalterado (`2.656 B`) |
| `public/apple-touch-icon.png` | `7,46 KB` (`7.634 B`) | Inalterado (`0 B` diff) |
| `public/icon-192.png` | `10,30 KB` (`10.548 B`) | Inalterado (`0 B` diff) |
| `public/icon-512.png` | `28,80 KB` (`29.493 B`) | Inalterado (`0 B` diff) |
| `public/icon-maskable-512.png` | `21,17 KB` (`21.676 B`) | Inalterado (`0 B` diff) |
| `public/site.webmanifest` | `0,52 KB` (`528 B`) | Inalterado (`0 B` diff) |

## 3. Auditoria de pixels no Chromium (Playwright, `<img>` 16×16 e 32×32, `dpr 1`)

Tolerâncias estritas (distância Chebyshev por canal): `#CD9016` (`≤ 24`), `#171717` (`≤ 24`) e `#FFFFFF` no aro superior (`≤ 6`, distinguindo `#FFFFFF` da placa `#FAFAF8` que tem distância `7`). Resultados idênticos sobre `#FFFFFF` e `#202124`:

| Ativo (Chromium `16×16`, `dpr 1`) | `#CD9016` (`≤24`) | `#171717` (`≤24`) | `#FFFFFF` aro (`≤6`) | Furo R claro | Vão W claro |
|---|---:|---:|---:|---:|---:|
| Rodada 2 · `favicon.svg` | `5` | `18` | `0` | `3` | `2` |
| Rodada 3 · `favicon.svg` | `15` | `18` | `2` | `3` | `11` |
| **Rodada 4 · `favicon.svg`** | **`17`** (`+2` vs R3) | **`24`** (`+6` vs R3) | **`12`** (`+10` vs R3) | **`4`** | **`10`** |
| Rodada 3 · `favicon.ico` 16 (ref. flat) | `25` | `36` | `17` | `3` | `11` |

Em `32×32` no Chromium (`dpr 1`, `#FFFFFF`): `furoClaro32 = 13 px` (`≥ 4`), `vaoWEsq32 = 18 px` (`≥ 4`), `vaoWDir32 = 16 px` (`≥ 4`).

## 4. Métricas do gate (`docs/gauntlet/t5/rodada-4/metricas.json`)

- **`astro check`**: OK (`10,29 s`) · **`astro build`**: OK (`4,87 s`) · **Console**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Reprodutibilidade do gerador**: **9/9 ativos byte-a-byte idênticos** (`--check` OK), sem gradientes/filtros/imagens.
- **Fidelidade SVG 1024×1024 vs T2 R7**: **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,5%`).
- **Troca 3D (`2,59 s`) → SVG (`2,61 s`)**: Desktop **`0,0000%`** (`0 px`) · Mobile **`0,0022%`** (`65 px`, meta `≤ 0,5%`).
- **Voo, fade do fundo e recorte 4× do header**: fundo em `2,85 s` = **`0,50`**; diff pouso↔header = **`0,0319%`** (`1 / 3.136 px`).
- **Pose final T4 (`2,4 s` vs T2 R7)**: **`0,0000%`** (`0 px`, meta `≤ 0,3%`).
- **Desempenho HLR médio**: Desktop **`1,342 ms`** · Mobile **`0,908 ms`** (meta `≤ 4,0 ms`).
- **Testes de fluxo, regressão e favicons**: **11/11 OK** — HTTP 200 nas 7 rotas, 4 links no `<head>`, ausência de `prefers-color-scheme`, `ico16IdenticoRodada3 = true`, `pixelAudit16` OK (`corDominanteR=#CD9016`, `corDominanteW=#171717`, `pxRPuros=25`, `pxWPuros=24`, `pxTopoBrancos=17`, `pxVaoWCol3=5`, `pxVaoWCol6=6`, `pxFuroR=5`), `pixelAuditSvg16Chromium` OK, cantos transparentes/opacos corretos.

## 5. Evidência visual principal

- `docs/gauntlet/t5/rodada-4/favicon.png`: mantém as 3 faixas (`#FAFAF8`, `#FFFFFF`, `#202124`) com simulação de aba `16 px` (`favicon.ico` e `favicon.svg` renderizados no Chromium) e os 7 tamanhos (`16`/`32`/`48` em `4×` nearest, `180`, `192 any`, `512 any`, `512 maskable`), e acrescenta no rodapé duas faixas de **comparação Chromium (`dpr 1`) em `#FFFFFF` e `#202124`** lado a lado em `8×` (`16 px`) e `4×` (`32 px`): `favicon.svg` da rodada 2, `favicon.svg` da rodada 3, `favicon.svg` da rodada 4 e `favicon.ico` 16 da rodada 3.
