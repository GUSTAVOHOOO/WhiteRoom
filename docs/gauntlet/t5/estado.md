# T5 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 4)

Branch: `GUSTAVOHOOO/splash-t5-svg` · Base: `411136c docs: handoff atualizado apos merge da T4`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json` — o gerador usa apenas `playwright`, `pngjs` e `sharp` já presentes em `tools/gauntlet/`).
Coreografia `0–2,60 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`), pipeline HLR (`cena/linhas/`), troca `3D → SVG`, voo, pouso, logos `whiteroom-logo.svg` / `whiteroom-logo-header.svg`, placa (`#FAFAF8`, `rx 21%`, borda `#E4E3DF`), ícones `180`/`192`/`512`/`maskable` e `site.webmanifest` estão **intactos**.

## 1. Arquitetura da T5

| Arquivo | Papel na T5 |
|---|---|
| `src/scripts/splash/cena/debug.ts` | Modo `/?debug=export-svg` (HLR em `1024×1024` + render WebGL transparente sem linhas em `4096×4096` `dpr 1`, expostos em `window.__wrExportSvg` com `dataset.exportSvgPronto = '1'`). Modos `/?debug=t4`, `/?debug=t4&t=` e modos T2 intactos. |
| `tools/gauntlet/gerar-logo-svg.mjs` | Gerador reprodutível (método b) que produz os **9 ativos versionados** a partir da cena 3D real: `src/assets/logo/whiteroom-logo.svg`, `src/assets/logo/whiteroom-logo-header.svg`, `public/favicon.svg`, `public/favicon.ico` (16 px flat-palette dedicado + 32 px simplificado + 48 px completo), `public/apple-touch-icon.png` (180×180), `public/icon-192.png` (`any`), `public/icon-512.png` (`any`), `public/icon-maskable-512.png` (`maskable`) e `public/site.webmanifest`. Aceita `--url <base>`, `--check` e `--skip-build`. |
| `src/assets/logo/whiteroom-logo.svg` | Logo vetorial completa (`7,55 KB`, `viewBox="0 0 1024 1024"`): 7 `<path>` de faces/sombras chapadas, `construcao` (`#A8A8A4`, `1,15 px`) e `contorno` (`#171717`, `5,50 px`). Diff contra `t2/rodada-7/captura.png` em 1024×1024 = **`0,0000%` (`0 px`)**. Inalterada desde a rodada 1. |
| `src/assets/logo/whiteroom-logo-header.svg` | Versão do header (`6,81 KB`, `viewBox="221.46 220.17 580 580"`): mesmas faces + contorno `10,00` sem construção. `logo-provisoria.svg` removida. Inalterada desde a rodada 1. |
| `public/favicon.svg`, `public/favicon.ico` | **Rodada 4**: `public/favicon.svg` (`0,92 KB`, `944 B`, `viewBox="0 0 32 32"`) retorna à grade `32×32` derivada do 3D (`derivarGeometriaFavicon32`) com bordas retas em coordenadas pares (`x = 4, 6, 14, 16, 18, 24, 28`), diagonais isométricas exatas `2:1`, placa intacta (`#FAFAF8`, `rx = 21%`, borda `#E4E3DF`, sem `prefers-color-scheme`), `R` em `#CD9016` puro sem contorno escuro sobreposto, curva superior suave (`Q28 10.5 28 14`) e furo claro (`13 px` em 32 px), `W` `#171717` com vãos abertos (`18`/`16 px` claros em 32 px), aro `#FFFFFF` contínuo (`FAVICON_32_RIM_H = 3,5`) emoldurado por trás por `contorno-topo` (`2,5`) sem fenda com o R nem traço duplicado. Em `public/favicon.ico` (`3,83 KB`, `3.923 B`), a entrada `16×16` flat-palette da rodada 3 (`302 B`) e a `48×48` completa (`2.656 B`) permanecem **bit-a-bit idênticas**, enquanto a entrada `32×32` (`911 B`) passa a ser rasterizada a partir do novo `favicon.svg` `32×32`. |
| `public/apple-touch-icon.png`, `public/icon-{192,512}.png`, `public/icon-maskable-512.png`, `public/site.webmanifest` | **Inalterados desde a rodada 2**: `apple-touch-icon.png` (`7,46 KB`, `180×180`) quadrado opaco `#FAFAF8`; `icon-192.png` (`10,30 KB`) e `icon-512.png` (`28,80 KB`, `"purpose": "any"`) com placa arredondada `#FAFAF8` (`rx 21%`, borda `#E4E3DF`) e cantos transparentes; `icon-maskable-512.png` (`21,17 KB`, `"purpose": "maskable"`) quadrado opaco `#FAFAF8` com cubo na zona segura de `80%` (`viewBox 740`); `site.webmanifest` (`0,52 KB`). |
| `src/layouts/Base.astro` | `<head>` com os 4 links: `icon` SVG, `icon` ICO (`sizes="any"`), `apple-touch-icon` e `manifest` (`/site.webmanifest`). |
| `src/scripts/splash/{logo,contrato,animacao,controlador}.ts`, `src/components/{Header,Splash}.astro` | Troca `3D → SVG` em `2,60 s`, voo SVG `2,60–3,10 s` com fade de construção e do fundo e compensação de contorno, `pular()` sem encolher 3D. Intactos desde a rodada 1. |
| `tools/gauntlet/t5-rodada.mjs` | Gate completo da T5 na porta `4403` (sempre desligado no `finally`): check/build, reprodutibilidade byte-a-byte dos 9 ativos, fidelidade SVG 1024, troca `2,59 vs 2,61` desktop/mobile, voo/fundo/pouso 4×, pose `2,4 s`, benchmark, 11 testes de fluxo/regressão/favicons (incluindo HTTP 200 nas 7 rotas, verificação byte-a-byte do ICO 16 da R3, auditoria pixel-a-pixel do ICO 16 e auditoria Chromium 16 px / 32 px de `favicon.svg`), `folha-contato.png` e `favicon.png` (3 fundos + aba 16 px no Chromium + rodapé comparativo Chromium 8×/4× em `#FFFFFF` e `#202124` com R2 SVG, R3 SVG, R4 SVG e R3 ICO 16). |

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

## 5. Passagem de bastão

- A falha nº 1 da crítica da rodada 3 está corrigida e documentada visualmente no Chromium em `docs/gauntlet/t5/rodada-4/favicon.png` (aba `16 px` nos 3 fundos + rodapé comparativo `8×`/`4×` em `#FFFFFF` e `#202124` de R2 SVG, R3 SVG, R4 SVG e R3 ICO 16).
- Nenhuma peça fora do escopo foi alterada: `src/` (`0 B` diff), `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, placa, entradas `16×16` (`302 B`) e `48×48` (`2.656 B`) do `.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `site.webmanifest` permanecem bit-a-bit idênticos à rodada 3.
- Para ajustes futuros em `favicon.svg` (`32×32`), basta editar `FAVICON_32_CONTORNO_TOPO_H` / `FAVICON_32_RIM_H` ou `derivarGeometriaFavicon32()` em `tools/gauntlet/gerar-logo-svg.mjs`, regenerar com `node tools/gauntlet/gerar-logo-svg.mjs` e validar com `node tools/gauntlet/t5-rodada.mjs <n>`.
