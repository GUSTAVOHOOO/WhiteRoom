# T5 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 3)

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
| `public/favicon.svg`, `public/favicon.ico` | **Rodada 3**: `public/favicon.svg` (`0,81 KB`, `827 B`, `viewBox="0 0 16 16"`) e a entrada `16×16` de `public/favicon.ico` (`4,28 KB`, `4.386 B`) usam grade inteira `16×16` dedicada derivada da mesma geometria simplificada 3D (`derivarGradeFavicon16`), com placa `#FAFAF8` (`rx = 21%`, borda `#E4E3DF`, sem `prefers-color-scheme`), sem contorno escuro por cima do R (`#CD9016` puro com furo claro nítido), W `#171717` com vãos abertos em colunas inteiras distintas (`3` e `6`), aro branco `#FFFFFF` contínuo emoldurado por trás por `#171717` e separado da cavidade `#C6C5C1`. A entrada `16×16` do `.ico` é rasterizada com pixels chapados da paleta (`rasterizarFavicon16FlatPng`); as entradas `32×32` simplificada e `48×48` completa permanecem inalteradas da rodada 2. |
| `public/apple-touch-icon.png`, `public/icon-{192,512}.png`, `public/icon-maskable-512.png`, `public/site.webmanifest` | **Inalterados desde a rodada 2**: `apple-touch-icon.png` (`7,46 KB`, `180×180`) quadrado opaco `#FAFAF8`; `icon-192.png` (`10,30 KB`) e `icon-512.png` (`28,80 KB`, `"purpose": "any"`) com placa arredondada `#FAFAF8` (`rx 21%`, borda `#E4E3DF`) e cantos transparentes; `icon-maskable-512.png` (`21,17 KB`, `"purpose": "maskable"`) quadrado opaco `#FAFAF8` com cubo na zona segura de `80%` (`viewBox 740`); `site.webmanifest` (`0,52 KB`). |
| `src/layouts/Base.astro` | `<head>` com os 4 links: `icon` SVG, `icon` ICO (`sizes="any"`), `apple-touch-icon` e `manifest` (`/site.webmanifest`). |
| `src/scripts/splash/{logo,contrato,animacao,controlador}.ts`, `src/components/{Header,Splash}.astro` | Troca `3D → SVG` em `2,60 s`, voo SVG `2,60–3,10 s` com fade de construção e do fundo e compensação de contorno, `pular()` sem encolher 3D. Intactos desde a rodada 1. |
| `tools/gauntlet/t5-rodada.mjs` | Gate completo da T5 na porta `4403` (sempre desligado no `finally`): check/build, reprodutibilidade byte-a-byte dos 9 ativos, fidelidade SVG 1024, troca `2,59 vs 2,61` desktop/mobile, voo/fundo/pouso 4×, pose `2,4 s`, benchmark, 11 testes de fluxo/regressão/favicons (incluindo HTTP 200 nas 7 rotas, auditoria pixel-a-pixel do `16×16` e integridade inteira de `favicon.svg`), `folha-contato.png` e `favicon.png` (3 fundos + aba 16 px + painel de comparação `8×` nearest-neighbor R2 vs final). |

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

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador | SVG 1024 vs T2 R7 | Troca `2,59↔2,61` (Desk / Mob) | Fundo `2,85 s` / Pouso↔Header | Pose `2,4 s` vs T2 R7 | HLR médio (Desk / Mob) | Fluxo + Favicon |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Gerador método (b) + SVGs finais + troca sem pulo + voo SVG + fade fundo no voo + `pular()` + favicons/manifest + gate T5 | OK / OK / 0 err, 0 warn | 8/8 OK (`7,55 KB` / `6,81 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`1,120 ms`** / **`0,860 ms`** | **11/11 OK** |
| 2 | Plaquinha `#FAFAF8` (`rx 21%`, borda `#E4E3DF`), favicon simplificado 3D em grade `32×32` (`16/32` + `favicon.svg`), `48 px` completo na placa, Android `any` arredondados + `icon-maskable-512.png`, `favicon.png` nos 3 fundos + aba 16 px | OK / OK / 0 err, 0 warn | **9/9 OK** (`7,55 KB` / `6,81 KB` inalterados; `favicon.svg` `1,27 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,941 ms`** / **`0,988 ms`** | **11/11 OK** (7/7 rotas 200) |
| 3 | Grade inteira `16×16` dedicada derivada do 3D (`public/favicon.svg` em `viewBox="0 0 16 16"` + entrada `16×16` flat-palette do `.ico`), sem contorno escuro no R (`#CD9016` puro), vão do W aberto em colunas inteiras (`3`/`6`), aro `#FFFFFF` contínuo sobre cavidade `#C6C5C1`, comparação `8×` R2 vs final em `favicon.png` | OK / OK / 0 err, 0 warn | **9/9 OK** (`favicon.svg` `0,81 KB`, `favicon.ico` `4,28 KB`; demais 7 inalterados) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,880 ms`** / **`1,130 ms`** | **11/11 OK** (7/7 rotas 200 + `pixelAudit16` OK) |

## 5. Passagem de bastão

- A falha nº 1 da crítica da rodada 2 está corrigida e documentada visualmente em `docs/gauntlet/t5/rodada-3/favicon.png` (incluindo comparação `8×` nearest-neighbor lado a lado com o `16×16` da rodada 2 e simulação de aba nos 3 fundos).
- Nenhuma outra peça foi alterada: `src/` (`0 B` diff), `whiteroom-logo.svg`, `whiteroom-logo-header.svg`, placa, entradas `32×32`/`48×48` do `.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `site.webmanifest` permanecem bit-a-bit idênticos à rodada 2.
- Para ajustes futuros na grade `16×16`, basta editar `FAVICON_16_LADO` / `FAVICON_16_Y_OFFSET` ou `derivarGradeFavicon16()` em `tools/gauntlet/gerar-logo-svg.mjs`, regenerar com `node tools/gauntlet/gerar-logo-svg.mjs` e validar com `node tools/gauntlet/t5-rodada.mjs <n>`.
