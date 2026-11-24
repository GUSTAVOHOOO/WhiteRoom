# T5 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 2)

Branch: `GUSTAVOHOOO/splash-t5-svg` · Base: `411136c docs: handoff atualizado apos merge da T4`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json` — o gerador usa apenas `playwright`, `pngjs` e `sharp` já presentes em `tools/gauntlet/`).
Coreografia `0–2,60 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`), pipeline HLR (`cena/linhas/`), troca `3D → SVG`, voo, pouso e logos `whiteroom-logo.svg` / `whiteroom-logo-header.svg` estão **intactos**.

## 1. Arquitetura da T5

| Arquivo | Papel na T5 |
|---|---|
| `src/scripts/splash/cena/debug.ts` | Modo `/?debug=export-svg` (HLR em `1024×1024` + render WebGL transparente sem linhas em `4096×4096` `dpr 1`, expostos em `window.__wrExportSvg` com `dataset.exportSvgPronto = '1'`). Modos `/?debug=t4`, `/?debug=t4&t=` e modos T2 intactos. |
| `tools/gauntlet/gerar-logo-svg.mjs` | Gerador reprodutível (método b) que produz os **9 ativos versionados** a partir da cena 3D real: `src/assets/logo/whiteroom-logo.svg`, `src/assets/logo/whiteroom-logo-header.svg`, `public/favicon.svg`, `public/favicon.ico` (16/32 simplificados + 48 completo), `public/apple-touch-icon.png` (180×180), `public/icon-192.png` (`any`), `public/icon-512.png` (`any`), `public/icon-maskable-512.png` (`maskable`) e `public/site.webmanifest`. Aceita `--url <base>`, `--check` e `--skip-build`. |
| `src/assets/logo/whiteroom-logo.svg` | Logo vetorial completa (`7,55 KB`, `viewBox="0 0 1024 1024"`): 7 `<path>` de faces/sombras chapadas, `construcao` (`#A8A8A4`, `1,15 px`) e `contorno` (`#171717`, `5,50 px`). Diff contra `t2/rodada-7/captura.png` em 1024×1024 = **`0,0000%` (`0 px`)**. Inalterada na rodada 2. |
| `src/assets/logo/whiteroom-logo-header.svg` | Versão do header (`6,81 KB`, `viewBox="221.46 220.17 580 580"`): mesmas faces + contorno `10,00` sem construção. `logo-provisoria.svg` removida. Inalterada na rodada 2. |
| `public/favicon.svg`, `public/favicon.ico` | **Rodada 2**: todos os favicons usam placa clara `#FAFAF8` de cantos arredondados (`rx = 21%`) com traço fino `#E4E3DF` e sem `prefers-color-scheme`. `favicon.svg` (`1,27 KB`, `viewBox="0 0 32 32"`) e as entradas `16/32 px` do `favicon.ico` (`4,62 KB`) usam a versão simplificada derivada dos polígonos 3D (sem porta/janela traseira/sombras/divisórias finas, mantendo topo aberto, vão do W e furo do R, ajustada na grade `32×32` com `8%` de respiro). A entrada `48 px` usa a versão completa na mesma placa (`viewBox 658`, contorno `9,00`). |
| `public/apple-touch-icon.png`, `public/icon-{192,512}.png`, `public/icon-maskable-512.png`, `public/site.webmanifest` | **Rodada 2**: `apple-touch-icon.png` (`7,46 KB`, `180×180`) mantém fundo quadrado opaco `#FAFAF8`; `icon-192.png` (`10,30 KB`) e `icon-512.png` (`28,80 KB`, `"purpose": "any"`) usam a placa arredondada `#FAFAF8` (`rx 21%`, borda `#E4E3DF`) com cantos transparentes; `icon-maskable-512.png` (`21,17 KB`, `"purpose": "maskable"`) usa fundo quadrado opaco `#FAFAF8` com cubo dentro da zona segura central de `80%` (`viewBox 740`). `site.webmanifest` (`0,52 KB`) declara os três ícones com seus respectivos `purpose`. |
| `src/layouts/Base.astro` | `<head>` com os 4 links: `icon` SVG, `icon` ICO (`sizes="any"`), `apple-touch-icon` e `manifest` (`/site.webmanifest`). |
| `src/scripts/splash/{logo,contrato,animacao,controlador}.ts`, `src/components/{Header,Splash}.astro` | Troca `3D → SVG` em `2,60 s`, voo SVG `2,60–3,10 s` com fade de construção e do fundo e compensação de contorno, `pular()` sem encolher 3D. Intactos desde a rodada 1. |
| `tools/gauntlet/t5-rodada.mjs` | Gate completo da T5 na porta `4403` (sempre desligado no `finally`): check/build, reprodutibilidade byte-a-byte dos 9 ativos, fidelidade SVG 1024, troca `2,59 vs 2,61` desktop/mobile, voo/fundo/pouso 4×, pose `2,4 s`, benchmark, 11 testes de fluxo/regressão/favicons (incluindo HTTP 200 nas 7 rotas, `purpose` do manifest, transparência dos cantos e ausência de `prefers-color-scheme`), `folha-contato.png` e `favicon.png` (3 fundos `#FAFAF8`, `#FFFFFF`, `#202124` + simulação de aba 16 px). |

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
3. **Favicon simplificado derivado da geometria 3D (rodada 2)**:
   - Em vez de desenhar um ícone separado à mão, `montarFaviconSimplificado()` parte dos polígonos reais de `topo`, `w-externa` e `r-externa` extraídos do render `4096×4096`, descarta sombras/porta/janela/divisórias finas, remove micro-degraus (`< 38 px`) de `topo`, deriva a cavidade limpa `#EBEAE6` costurando a borda interna de `topo` ao recorte superior de `w-externa`, e projeta na grade `32×32` (`X` em inteiros `4..28` alinhados em 16 e 32 px; `Y` em meio-pixel `2,5..29,5` para preservar espessura uniforme de `2 px` no aro branco superior).
   - Não aplicar traço escuro em `w-externa` nem no contorno interno do furo do R impede que o vão do W e o furo do R se fechem em `16×16 px`.
   - Traço `#E4E3DF` na placa `#FAFAF8` (`rx = 21%`) garante definição em abas e drawers brancos (`#FFFFFF`) sem prejudicar o contraste em `#202124`, eliminando a necessidade de `prefers-color-scheme`.

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador | SVG 1024 vs T2 R7 | Troca `2,59↔2,61` (Desk / Mob) | Fundo `2,85 s` / Pouso↔Header | Pose `2,4 s` vs T2 R7 | HLR médio (Desk / Mob) | Fluxo + Favicon |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Gerador método (b) + SVGs finais + troca sem pulo + voo SVG + fade fundo no voo + `pular()` + favicons/manifest + gate T5 | OK / OK / 0 err, 0 warn | 8/8 OK (`7,55 KB` / `6,81 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`1,120 ms`** / **`0,860 ms`** | **11/11 OK** |
| 2 | Plaquinha `#FAFAF8` (`rx 21%`, borda `#E4E3DF`), favicon simplificado 3D em grade `32×32` (`16/32` + `favicon.svg`), `48 px` completo na placa, Android `any` arredondados + `icon-maskable-512.png`, `favicon.png` nos 3 fundos + aba 16 px | OK / OK / 0 err, 0 warn | **9/9 OK** (`7,55 KB` / `6,81 KB` inalterados; `favicon.svg` `1,27 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,941 ms`** / **`0,988 ms`** | **11/11 OK** (7/7 rotas 200) |

## 5. Passagem de bastão

- Todas as três decisões do dono sobre a crítica da rodada 1 foram implementadas e verificadas visualmente em `docs/gauntlet/t5/rodada-2/favicon.png` (sobre `#FAFAF8`, `#FFFFFF` e `#202124`, incluindo simulação de aba `16 px`).
- Nenhuma métrica da rodada 1 regrediu; `whiteroom-logo.svg`, `whiteroom-logo-header.svg` e toda a animação 3D/SVG permaneceram bit-a-bit idênticos.
- Para ajustar futuramente borda, raio da placa (`PLACA_RAIO_FRAC`), margem (`FAVICON_SIMPLIFICADO_MARGEM_FRAC`) ou espessuras, basta editar as constantes no topo de `tools/gauntlet/gerar-logo-svg.mjs`, rodar `node tools/gauntlet/gerar-logo-svg.mjs` e validar com `node tools/gauntlet/t5-rodada.mjs <n>`.
