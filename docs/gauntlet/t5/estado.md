# T5 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 5)

Branch: `GUSTAVOHOOO/splash-t5-svg` · Base: `411136c docs: handoff atualizado apos merge da T4`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json` — o gerador usa apenas `playwright`, `pngjs` e `sharp` já presentes em `tools/gauntlet/`).
Coreografia `0–2,60 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`), pipeline HLR (`cena/linhas/`), troca `3D → SVG`, voo, pouso, logos `whiteroom-logo.svg` / `whiteroom-logo-header.svg`, geometria dos cubos de todos os ícones, `apple-touch-icon.png`, `icon-maskable-512.png` e `site.webmanifest` estão **intactos**.

## 1. Arquitetura da T5

| Arquivo | Papel na T5 |
|---|---|
| `src/scripts/splash/cena/debug.ts` | Modo `/?debug=export-svg` (HLR em `1024×1024` + render WebGL transparente sem linhas em `4096×4096` `dpr 1`, expostos em `window.__wrExportSvg` com `dataset.exportSvgPronto = '1'`). Modos `/?debug=t4`, `/?debug=t4&t=` e modos T2 intactos. |
| `tools/gauntlet/gerar-logo-svg.mjs` | Gerador reprodutível (método b) que produz os **9 ativos versionados** a partir da cena 3D real: `src/assets/logo/whiteroom-logo.svg`, `src/assets/logo/whiteroom-logo-header.svg`, `public/favicon.svg`, `public/favicon.ico` (16 px flat-palette dedicado + 32 px simplificado + 48 px completo), `public/apple-touch-icon.png` (180×180), `public/icon-192.png` (`any`), `public/icon-512.png` (`any`), `public/icon-maskable-512.png` (`maskable`) e `public/site.webmanifest`. Aceita `--url <base>`, `--check` e `--skip-build`. |
| `src/assets/logo/whiteroom-logo.svg` | Logo vetorial completa (`7,55 KB`, `viewBox="0 0 1024 1024"`): 7 `<path>` de faces/sombras chapadas, `construcao` (`#A8A8A4`, `1,15 px`) e `contorno` (`#171717`, `5,50 px`). Diff contra `t2/rodada-7/captura.png` em 1024×1024 = **`0,0000%` (`0 px`)**. Inalterada desde a rodada 1. |
| `src/assets/logo/whiteroom-logo-header.svg` | Versão do header (`6,81 KB`, `viewBox="221.46 220.17 580 580"`): mesmas faces + contorno `10,00` sem construção. `logo-provisoria.svg` removida. Inalterada desde a rodada 1. |
| `public/favicon.svg`, `public/favicon.ico` | **Rodada 5**: geometria do cubo 100% preservada da rodada 4 (`public/favicon.svg` `0,91 KB`, `932 B`, `viewBox="0 0 32 32"`, bordas pares, diagonais `2:1`, `R` `#CD9016` puro com curva superior, `W` `#171717` com vãos abertos, aro `#FFFFFF` contínuo), com borda da placa `#D6D5D0` (`stroke-width="2"`, inset `1`, `1 px` nítido em `16 px`, contraste `1,47:1` contra `#FFFFFF`). Em `public/favicon.ico` (`3,81 KB`, `3.899 B`), a entrada `16×16` (`280 B`, cubo `0 px` diff vs R3/R4) ganha anel de `1 px` opaco `#D6D5D0` sem AA interno (contraste `1,47:1`), e as entradas `32×32` (`912 B`) e `48×48` (`2.653 B`) usam borda `1 px` opaco `#D6D5D0`. |
| `public/apple-touch-icon.png`, `public/icon-{192,512}.png`, `public/icon-maskable-512.png`, `public/site.webmanifest` | **Rodada 5**: `apple-touch-icon.png` (`7,46 KB`, `180×180`), `icon-maskable-512.png` (`21,17 KB`, `"purpose": "maskable"`, zona segura `80%`) e `site.webmanifest` (`0,52 KB`) **inalterados desde a rodada 2**; `icon-192.png` (`10,52 KB`, `10.768 B`) e `icon-512.png` (`29,15 KB`, `29.853 B`, `"purpose": "any"`) mantêm placa `#FAFAF8` (`rx 21%`) com transparência externa e borda `#D6D5D0` de `1,5 px` e `3,5 px` respectivamente (contraste `1,47:1` contra `#FFFFFF`). |
| `src/layouts/Base.astro` | `<head>` com os 4 links: `icon` SVG, `icon` ICO (`sizes="any"`), `apple-touch-icon` e `manifest` (`/site.webmanifest`). |
| `src/scripts/splash/{logo,contrato,animacao,controlador}.ts`, `src/components/{Header,Splash}.astro` | Troca `3D → SVG` em `2,60 s`, voo SVG `2,60–3,10 s` com fade de construção e do fundo e compensação de contorno, `pular()` sem encolher 3D. Intactos desde a rodada 1. |
| `tools/gauntlet/t5-rodada.mjs` | Gate completo da T5 na porta `4403` (sempre desligado no `finally`): check/build, reprodutibilidade byte-a-byte dos 9 ativos, fidelidade SVG 1024, troca `2,59 vs 2,61` desktop/mobile, voo/fundo/pouso 4×, pose `2,4 s`, benchmark, 11 testes de fluxo/regressão/favicons (incluindo HTTP 200 nas 7 rotas, `ico16CuboIdenticoRodada3`, auditoria pixel-a-pixel do ICO 16, auditoria Chromium 16/32 px de `favicon.svg` e medição `bordaPlacaContraste` sobre `#FFFFFF` com meta `≥ 1,35:1`), `folha-contato.png` e `favicon.png` (3 fundos + aba 16 px no Chromium + rodapé comparativo Rodada 4 vs Rodada 5 em `#FFFFFF` e `#202124`). |

## 2. Como rodar o gerador e o gate

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Regenerar SVGs + favicons/ícones (sobe preview temporário na porta 4403 e encerra ao fim)
node tools/gauntlet/gerar-logo-svg.mjs

# Conferir reprodutibilidade byte-a-byte contra os arquivos commitados
node tools/gauntlet/gerar-logo-svg.mjs --check

# Rodar o gate completo da T5 (rodada <n>)
node tools/gauntlet/t5-rodada.mjs <n>
```

## 3. Decisões técnicas importantes e armadilhas evitadas

1. **Método (b) com proteção contra falsos positivos de anti-aliasing (`gerar-logo-svg.mjs`)**: classificação em duas etapas + campo contínuo `sombraFrac` + união `interna ∪ sombra` na camada `interna` + XML estrito.
2. **Sem `will-change-transform` nem `translate3d` em `[data-splash-svg-final]`** e **alinhamento subpixel `left: 0; top: 0` + snap de dispositivo no pouso (`animacao.ts`)**: troca desktop `0,0000%`, mobile `0,0022%`, pouso↔header `0,0319%`.
3. **Favicon `16×16` com grade própria derivada do 3D (rodada 3)**:
   - `extrairGeometriaFaviconSimplificado()` compartilha os polígonos simplificados 3D entre `derivarGradeFavicon16()` (`public/favicon.svg` + entrada `16×16` do `.ico`) e `montarFaviconSimplificado32()` (entrada `32×32` preservada).
   - Em `16×16`, todos os vértices do cubo são inteiros (`viewBox="0 0 16 16"`), o R não recebe contorno escuro (`#CD9016` puro, `25 px` no ICO 16), a moldura externa do topo (`topoMolduraGrid`) é desenhada atrás do aro branco (`17 px` em `#FFFFFF`) para não apagar o branco, e a cavidade interna usa `#C6C5C1` (`PALETA[IDX_SOMBRA]`) para separar o aro branco do quarto aberto.
   - `rasterizarFavicon16FlatPng()` amostra o centro exato `(x + 0,5, y + 0,5)` de cada pixel em cores chapadas da paleta sobre a placa arredondada `#FAFAF8`, evitando tanto o borramento de AA quanto o fechamento do vão do W observado com `shape-rendering="crispEdges"` no `librsvg`.

4. **Favicon `32×32` nítido em 16 px e 32 px no Chromium (rodada 4)**:
   - `derivarGeometriaFavicon32(geom)` projeta o cubo simplificado 3D em `viewBox="0 0 32 32"` com paredes verticais pares (`4, 6, 14, 16, 18, 24, 28`) e diagonais isométricas `2:1`, usando `contorno-topo` atrás do aro (`2,5 px`) e aro branco (`3,5 px`) sobre cavidade `#C6C5C1` para preservar pixels puros em `16×16` sem estourar nem criar degraus `2×2` em `32×32`.
   - Auditoria Chromium `16×16` (`dpr 1`, `#FFFFFF` e `#202124`, tol `24`/`24`/`6`): `#CD9016` = **`17`** (`+2` vs R3, era `5` em R2), `#171717` = **`24`** (`+6` vs R3), `#FFFFFF` aro = **`12`** (`+10` vs R3, era `0` em R2), furo R claro = `4`, vão W claro = `10`; em `32×32`: furo claro = `13 px`, vãos W = `18`/`16 px`.

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador | SVG 1024 vs T2 R7 | Troca `2,59↔2,61` (Desk / Mob) | Fundo `2,85 s` / Pouso↔Header | Pose `2,4 s` vs T2 R7 | HLR médio (Desk / Mob) | Fluxo + Favicon |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Gerador método (b) + SVGs finais + troca sem pulo + voo SVG + fade fundo no voo + `pular()` + favicons/manifest + gate T5 | OK / OK / 0 err, 0 warn | 8/8 OK (`7,55 KB` / `6,81 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`1,120 ms`** / **`0,860 ms`** | **11/11 OK** |
| 2 | Plaquinha `#FAFAF8` (`rx 21%`, borda `#E4E3DF`), favicon simplificado 3D em grade `32×32` (`16/32` + `favicon.svg`), `48 px` completo na placa, Android `any` arredondados + `icon-maskable-512.png`, `favicon.png` nos 3 fundos + aba 16 px | OK / OK / 0 err, 0 warn | **9/9 OK** (`7,55 KB` / `6,81 KB` inalterados; `favicon.svg` `1,27 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,941 ms`** / **`0,988 ms`** | **11/11 OK** (7/7 rotas 200) |
| 3 | Grade inteira `16×16` dedicada derivada do 3D (`public/favicon.svg` em `viewBox="0 0 16 16"` + entrada `16×16` flat-palette do `.ico`), sem contorno escuro no R (`#CD9016` puro), vão do W aberto em colunas inteiras (`3`/`6`), aro `#FFFFFF` contínuo sobre cavidade `#C6C5C1`, comparação `8×` R2 vs final em `favicon.png` | OK / OK / 0 err, 0 warn | **9/9 OK** (`favicon.svg` `0,81 KB`, `favicon.ico` `4,28 KB`; demais 7 inalterados) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,880 ms`** / **`1,130 ms`** | **11/11 OK** (7/7 rotas 200 + `pixelAudit16` OK) |
| 4 | `public/favicon.svg` em `viewBox="0 0 32 32"` derivado do 3D (bordas pares, diagonais `2:1`, curva do R, aro `#FFFFFF` contínuo sem fenda, sem contorno sobre R), ICO `16×16` da R3 intacto (`302 B`) + `32×32` atualizado, evidência e auditoria Chromium `16/32 px` (`#FFFFFF` e `#202124`) | OK / OK / 0 err, 0 warn | **9/9 OK** (`favicon.svg` `0,92 KB`, `favicon.ico` `3,83 KB`; demais 7 inalterados) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`1,342 ms`** / **`0,908 ms`** | **11/11 OK** (7/7 rotas 200 + `pixelAudit16` + `pixelAuditSvg16Chromium` OK) |
| 5 | Borda da placa `#D6D5D0` visível em `#FFFFFF` (contraste `1,47:1` ≥ `1,35:1` nos 4 ativos): `favicon.svg` (`2 u`, inset `1`), ICO `16×16` (`1 px` opaco sem AA interno, cubo `0 px` diff), ICO `32/48` (`1 px`), `icon-192` (`1,5 px`) e `icon-512` (`3,5 px`); geometria de todos os cubos e demais 5 ativos intactos | OK / OK / 0 err, 0 warn | **9/9 OK** (`favicon.svg` `0,91 KB`, `favicon.ico` `3,81 KB`, `icon-192` `10,52 KB`, `icon-512` `29,15 KB`; demais 5 inalterados) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,839 ms`** / **`0,901 ms`** | **11/11 OK** (7/7 rotas 200 + `pixelAudit16` + `pixelAuditSvg16Chromium` + `bordaPlacaContraste` `1,47:1` OK) |

## 5. Passagem de bastão

- A falha nº 1 da crítica da rodada 4 está corrigida e documentada em `docs/gauntlet/t5/rodada-5/favicon.png` (3 fundos + aba `16 px` no Chromium + rodapé comparativo Rodada 4 vs Rodada 5 em `#FFFFFF` e `#202124`) e medida automaticamente em `docs/gauntlet/t5/rodada-5/metricas.json` (`bordaPlacaContraste`: `#D6D5D0`, **`1,47:1`** contra `#FFFFFF` em `favicon.svg` 16 px, `favicon.ico` 16 px, `icon-192` e `icon-512`, meta `≥ 1,35:1`).
- Nenhuma peça fora do escopo foi alterada: `src/` (`0 B` diff), geometria dos cubos de todos os ícones (`0 px` diff no cubo do ICO 16 e `Δ = 0` nas contagens R/W/branco do `favicon.svg` no Chromium), `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, `apple-touch-icon.png`, `icon-maskable-512.png` e `site.webmanifest` permanecem bit-a-bit idênticos à rodada 4.
- Para ajustes futuros na borda da placa, basta editar `COR_BORDA_PLACA`, `FAVICON_SVG_BORDA_SW`, `FAVICON_ICO_32_BORDA_SW`, `ICON_192_BORDA_PX` ou `ICON_512_BORDA_PX` em `tools/gauntlet/gerar-logo-svg.mjs`, regenerar com `node tools/gauntlet/gerar-logo-svg.mjs` e validar com `node tools/gauntlet/t5-rodada.mjs <n>`.
