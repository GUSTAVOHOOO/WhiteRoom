# T5 Rodada 5 — Notas: Borda da Placa `#D6D5D0` Visível em Fundo Branco

Esta rodada corrige exclusivamente a **falha nº 1** da crítica da rodada 4 (`docs/gauntlet/t5/rodada-4/critica.md`), tornando a borda da placa clara `#FAFAF8` nítida sobre fundo branco `#FFFFFF` na aba de `16 px` (`favicon.svg` e entrada `16×16` de `favicon.ico`), nas entradas `32×32` e `48×48` do `.ico` e nos ícones `icon-192.png` e `icon-512.png` (`purpose: "any"`), sem pesar sobre fundo escuro `#202124`.

A geometria do cubo de **todos** os ícones, a animação 3D, troca `3D → SVG`, voo, pouso, `pular()`, `src/` (`0 B` alterados), `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, `apple-touch-icon.png` (quadrado opaco), `icon-maskable-512.png` (cheio) e `site.webmanifest` permaneceram **intactos (`0 B` diff)**.

## 1. Correção no gerador (`tools/gauntlet/gerar-logo-svg.mjs`)

1. **Cor da borda da placa**: `COR_BORDA_PLACA` alterada de `#E4E3DF` para `#D6D5D0` em todos os favicons e ícones com placa arredondada (`#FAFAF8`, `rx = 21%`, transparência externa preservada nos `any`).
2. **Espessura por ativo**:
   - **`public/favicon.svg` (`viewBox="0 0 32 32"`)**: `FAVICON_SVG_BORDA_SW = 2` (`x="1" y="1" width="30" height="30" rx="5.72" stroke="#D6D5D0" stroke-width="2"`), desenhado inteiramente dentro da placa (inset de `1`), resultando em `1 px` nítido e opaco em `16×16` sem corte na borda do `viewBox`. Todos os `<path>` do cubo ficaram idênticos à rodada 4.
   - **Entrada `16×16` de `public/favicon.ico`**: silhueta externa arredondada (`rx = 3,36`) preenchida em `#D6D5D0` (mantendo AA limpo apenas por fora nos cantos arredondados e `alpha = 0` no canto `(0,0)`) com miolo interno `#FAFAF8` inset de `1 px` (`pontoDentroRectArredondado`, sem antialias por dentro), produzindo anel de `1 px` 100% opaco em `#D6D5D0` e `0 px` de diferença nos pixels do cubo em relação à rodada 3/4.
   - **Entradas `32×32` e `48×48` de `public/favicon.ico`**: `1 px` opaco em `#D6D5D0` (`FAVICON_ICO_32_BORDA_SW = 1` em `montarFavicon32Svg` e `FAVICON_48_VIEWBOX_LADO / 48` em `svgFavicon48`).
   - **`public/icon-192.png` (`purpose: "any"`)**: `ICON_192_BORDA_PX = 1,5 px` (`APP_ICON_VIEWBOX_LADO * (1.5 / 192)`).
   - **`public/icon-512.png` (`purpose: "any"`)**: `ICON_512_BORDA_PX = 3,5 px` (`APP_ICON_VIEWBOX_LADO * (3.5 / 512)`).
3. **`apple-touch-icon.png` e `icon-maskable-512.png`**: sem borda, inalterados bit-a-bit.

## 2. Tamanhos dos arquivos gerados (9/9 reprodutíveis byte-a-byte)

| Arquivo | Tamanho | Observação vs Rodada 4 |
|---|---|---|
| `src/assets/logo/whiteroom-logo.svg` | `7,55 KB` (`7.732 B`) | Inalterado (`0 B` diff) |
| `src/assets/logo/whiteroom-logo-header.svg` | `6,81 KB` (`6.971 B`) | Inalterado (`0 B` diff) |
| `public/favicon.svg` | `0,91 KB` (`932 B`) | Apenas linha 2 (`<rect>` placa): `#D6D5D0`, `stroke-width="2"`, inset `1` (era `944 B`) |
| `public/favicon.ico` | `3,81 KB` (`3.899 B`) | `16×16` (`280 B`, cubo `0 px` diff vs R3/R4) + `32×32` (`912 B`) + `48×48` (`2.653 B`), todos com borda `1 px` `#D6D5D0` |
| `public/apple-touch-icon.png` | `7,46 KB` (`7.634 B`) | Inalterado (`0 B` diff) |
| `public/icon-192.png` | `10,52 KB` (`10.768 B`) | Borda `#D6D5D0` `1,5 px` (era `10.548 B`) |
| `public/icon-512.png` | `29,15 KB` (`29.853 B`) | Borda `#D6D5D0` `3,5 px` (era `29.493 B`) |
| `public/icon-maskable-512.png` | `21,17 KB` (`21.676 B`) | Inalterado (`0 B` diff) |
| `public/site.webmanifest` | `0,52 KB` (`528 B`) | Inalterado (`0 B` diff) |

## 3. Contraste do anel da borda sobre `#FFFFFF` (meta ≥ 1,35:1)

Medição automática no gate (`medirAnelBordaSobreBranco` sobre os trechos retos do anel, compostos sobre `#FFFFFF`):

| Ativo | Cor média sobre `#FFFFFF` | RGB médio | Contraste vs `#FFFFFF` | Amostras | Status |
|---|---|---|---:|---:|---|
| `favicon.svg` (`16×16` no Chromium) | `#D6D5D0` | `[214, 213, 208]` | **`1,47:1`** | `12` (`1 px`) | **OK** (`≥ 1,35`) |
| `favicon.ico` (`16×16`) | `#D6D5D0` | `[214, 213, 208]` | **`1,47:1`** | `16` (`1 px`) | **OK** (`≥ 1,35`) |
| `icon-192.png` (`any`) | `#D6D5D0` | `[214, 213, 208]` | **`1,47:1`** | `424` (`1 px`) | **OK** (`≥ 1,35`) |
| `icon-512.png` (`any`) | `#D6D5D0` | `[214, 213, 208]` | **`1,47:1`** | `3.504` (`3 px`) | **OK** (`≥ 1,35`) |

Sobre `#202124` (faixa escura e rodapé de `docs/gauntlet/t5/rodada-5/favicon.png`), a borda `#D6D5D0` permanece leve e discreta, sem pesar na silhueta da placa clara.

## 4. Auditoria de pixels (mantida 100% da Rodada 4)

- **ICO `16×16` (`pixelAudit16`)**: `ico16CuboIdenticoRodada3 = true` (`0 px` diff no cubo), `corDominanteR = #CD9016`, `corDominanteW = #171717`, `pxRPuros = 25`, `pxWPuros = 24`, `pxTopoBrancos = 17`, `pxVaoWCol3 = 5`, `pxVaoWCol6 = 6`, `pxFuroR = 5`.
- **`favicon.svg` no Chromium (`pixelAuditSvg16Chromium`, `#FFFFFF` e `#202124`)**: `#CD9016 = 17` (`Δ vs R4 = 0`), `#171717 = 24` (`Δ vs R4 = 0`), `#FFFFFF` aro `= 12` (`Δ vs R4 = 0`), `pxFuroR = 4`, `pxVaoW = 10`; em `32×32`: `furoClaro32 = 13`, `vaoWEsq32 = 18`, `vaoWDir32 = 16`.

## 5. Métricas do gate (`docs/gauntlet/t5/rodada-5/metricas.json`)

- **`astro check`**: OK (`9,99 s`) · **`astro build`**: OK (`5,19 s`) · **Console**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Reprodutibilidade do gerador**: **9/9 ativos byte-a-byte idênticos**, sem gradientes/filtros/imagens.
- **Fidelidade SVG 1024×1024 vs T2 R7**: **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,5%`).
- **Troca 3D (`2,59 s`) → SVG (`2,61 s`)**: Desktop **`0,0000%`** (`0 px`) · Mobile **`0,0022%`** (`65 px`, meta `≤ 0,5%`).
- **Voo, fade do fundo e recorte 4× do header**: fundo em `2,85 s` = **`0,50`**; diff pouso↔header = **`0,0319%`** (`1 / 3.136 px`).
- **Pose final T4 (`2,4 s` vs T2 R7)**: **`0,0000%`** (`0 px`, meta `≤ 0,3%`).
- **Desempenho HLR médio**: Desktop **`0,839 ms`** · Mobile **`0,901 ms`** (meta `≤ 4,0 ms`).
- **Testes de fluxo, regressão e favicons**: **11/11 OK** — HTTP 200 nas 7 rotas, 4 links no `<head>`, ausência de `prefers-color-scheme`, `pixelAudit16` OK, `pixelAuditSvg16Chromium` OK, `bordaPlacaContraste` OK (`1,47:1` nos 4 ativos), cantos transparentes/opacos corretos.

## 6. Evidência visual principal

- `docs/gauntlet/t5/rodada-5/favicon.png`: 3 faixas (`#FAFAF8`, `#FFFFFF`, `#202124`) com simulação de aba `16 px` (`favicon.ico` e `favicon.svg` da rodada 5 no Chromium) + 7 tamanhos (`16`/`32`/`48` em `4×` nearest, `180`, `192 any`, `512 any`, `512 maskable`), e rodapé comparativo Chromium (`dpr 1`) em `#FFFFFF` e `#202124` lado a lado **Rodada 4 vs Rodada 5** (`favicon.svg 16`, `ICO 16`, `favicon.svg 32` e `ICO 32`).
