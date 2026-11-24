# T5 — Estado do Gauntlet Loop (Passagem de Bastão → Rodada 2)

Branch: `GUSTAVOHOOO/splash-t5-svg` · Base: `411136c docs: handoff atualizado apos merge da T4`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json` — o gerador usa apenas `playwright`, `pngjs` e `sharp` já presentes em `tools/gauntlet/`).
Coreografia `0–2,60 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`) e pipeline HLR (`cena/linhas/`) estão **intactos**.

## 1. Arquitetura da T5

| Arquivo | Papel na T5 |
|---|---|
| `src/scripts/splash/cena/debug.ts` | Adicionado modo `/?debug=export-svg` (extrai `dConstrucao`/`dContorno`/`paraSvgString()` do HLR em `1024×1024` + render WebGL transparente sem linhas em `4096×4096` `dpr 1`, expostos em `window.__wrExportSvg` com `dataset.exportSvgPronto = '1'`). Modo `/?debug=t4` e `/?debug=t4&t=` repassam `svgFinalEl` e `fundoEl` para `criarAnimacaoControlavel` e registram `hlrMs` apenas nos quadros onde o 3D executou (`hlrExecutado`). Modos T2 (`/?debug`, `/?debug=captura`, `/?debug=hlr`) intactos. |
| `tools/gauntlet/gerar-logo-svg.mjs` | Gerador reprodutível (método b) que produz os 8 ativos versionados a partir da cena 3D real: `src/assets/logo/whiteroom-logo.svg`, `src/assets/logo/whiteroom-logo-header.svg`, `public/favicon.svg`, `public/favicon.ico` (16/32/48 px em PNG-dentro-de-ICO), `public/apple-touch-icon.png` (180×180), `public/icon-192.png`, `public/icon-512.png` e `public/site.webmanifest`. Aceita `--url <base>` (reaproveita servidor único), `--check` (valida igualdade byte-a-byte) e `--skip-build`. |
| `src/assets/logo/whiteroom-logo.svg` | Logo vetorial completa (`7,55 KB`, `viewBox="0 0 1024 1024"`): 7 `<path>` de faces/sombras chapadas (sem gradientes, filtros ou imagens), `<path data-logo-camada="construcao">` (`#A8A8A4`, `1,15 px`) e `<path data-logo-camada="contorno">` (`#171717`, `5,50 px`). Diff contra `t2/rodada-7/captura.png` em 1024×1024 = **`0,0000%` (`0 / 1.048.576 px`)**. |
| `src/assets/logo/whiteroom-logo-header.svg` | Versão do header (`6,81 KB`, `viewBox="221.46 220.17 580 580"` centrado no cubo `(511.46, 510.17)`): mesmas faces + contorno sem linhas de construção e com compensação óptica do traço (`stroke-width="10.00"`, `≈ 0,69 px` em `40×40 px`) para nitidez sem traços quebrados. `logo-provisoria.svg` foi removida. |
| `public/favicon.{svg,ico}`, `public/apple-touch-icon.png`, `public/icon-{192,512}.png`, `public/site.webmanifest` | Favicons e ícones PWA gerados diretamente da logo sem linhas de construção pelo mesmo gerador. `favicon.svg` (`6,81 KB`, `viewBox` `620×620`, ~6% margem, transparente) usa contorno `14,00` para manter legibilidade em `16×16 px` sobre fundos claro e escuro; `favicon.ico` (`4,85 KB`) empacota 16, 32 e 48 px; ícones 180/192/512 px usam fundo `#FAFAF8`, ~12% margem (`viewBox` `726×726`) e contorno oficial `5,50`. |
| `src/layouts/Base.astro` | `<head>` atualizado com os 4 links: `icon` SVG, `icon` ICO (`sizes="any"`), `apple-touch-icon` e `manifest` (`/site.webmanifest`). |
| `src/scripts/splash/logo.ts` | Exporta `LOGO_SVG`, `LOGO_HEADER_SVG`, `LOGO_DATA_URI` e `LOGO_HEADER_METRICAS` (lê `cx`, `cy`, `lado` e `contornoPx` diretamente do `whiteroom-logo-header.svg` para manter o pouso sincronizado automaticamente). |
| `src/components/Header.astro` | `[data-splash-alvo]` (`40×40 px`) renderiza `LOGO_HEADER_SVG`. |
| `src/components/Splash.astro` | `[data-splash-logo]` (reserva para fallback e movimento reduzido, continua `visibility: hidden` no modo normal via `global.css`) passa a usar `LOGO_SVG` com caixa `aspect-square w-full max-w-[100vh]` (escala 1:1 com o cubo 3D). Adicionado elemento `[data-splash-svg-final]` (`z-35`, `hidden`, sem `will-change-transform`) com `LOGO_SVG` para a troca em `2,60 s` e o voo. |
| `src/scripts/splash/contrato.ts` | `OpcoesAnimacaoSplash` estendido aditivamente com `svgFinal?: HTMLElement` e `fundo?: HTMLElement`. |
| `src/scripts/splash/animacao.ts` | Coreografia `0–2,60 s` intacta. Em `t = 2,60 s`, oculta `canvas` e `svgLinhas` (pula `renderer.render` e `linhas.atualizar`) e exibe `[data-splash-svg-final]` na posição/escala exatas do 3D (`left: 0; top: 0` + `transform: translate(...) scale(...)` 2D subpixel). Durante `2,60–3,10 s`: voo reto `power3.inOut` mirando o retângulo pintado (device-pixel snapped) de `alvo().rect`, fade das linhas de construção `2,60–2,90 s` (`power2.inOut`), fade do fundo `2,60–3,10 s` (`power2.inOut`, `0,50` em `2,85 s`) e compensação óptica do contorno `5,50 → 10,00` (`power2.inOut`). Em `pular()`: se pose completa ou já em voo, troca imediata para SVG e voa em `~300 ms`; se no meio da montagem, exibe SVG na pose final, faz fade do 3D em `100 ms` e voa em `~300 ms`. O 3D (`raizCubo`) nunca encolhe nem vai ao header. |
| `src/scripts/splash/controlador.ts` | Repassa `svgFinal` e `fundo` para `carregar3D` e `iniciarModoDebug`. Remove o fade pós-`tocar()` e pós-`pular()` do fundo (agora o fade ocorre durante o voo dentro de `animacao.ts`). Atualiza o FLIP do fallback para pousar `whiteroom-logo.svg` sobre `whiteroom-logo-header.svg` com fade de construção e compensação de contorno. |
| `tools/gauntlet/t5-rodada.mjs` | Gate completo da T5 na porta `4403` (sempre desligado no `finally`): check/build, reprodutibilidade byte-a-byte dos 8 ativos do gerador, fidelidade SVG 1024 vs T2 R7, troca `2,59 vs 2,61` desktop e mobile, capturas de voo `2,6..3,1 s`, medição do fundo em `2,85 s`, recortes `4×` nearest-neighbor do header (`3,10 s` vs pós-splash), pose final `2,4 s` vs T2 R7, benchmark desktop/mobile, 11 testes de fluxo/regressão/favicons, `folha-contato.png` e `favicon.png`. |

## 2. Como rodar o gerador e o gate

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Regenerar SVGs + favicons/ícones (sobe preview temporário e encerra ao fim)
node tools/gauntlet/gerar-logo-svg.mjs

# Conferir reprodutibilidade byte-a-byte contra os arquivos commitados
node tools/gauntlet/gerar-logo-svg.mjs --check

# Rodar o gate completo da T5 (rodada <n>)
node tools/gauntlet/t5-rodada.mjs <n>
```

Saídas em `docs/gauntlet/t5/rodada-<n>/`:
- `svg-completo-1024.png` e `svg-completo-diff.png`
- `troca-2.59s-{desktop,mobile}.png`, `troca-2.61s-{desktop,mobile}.png`, `troca-diff-{desktop,mobile}.png`
- `voo-{2.60,2.75,2.90,3.00,3.10}s-desktop.png`, `pos-splash-desktop.png`
- `header-3.10s-4x.png` e `header-pos-splash-4x.png` (recortes `56×56` ampliados `4×` nearest-neighbor → `224×224`)
- `pose-final-1024.png` e `pose-final-diff.png`
- `folha-contato.png`, `favicon.png`, `metricas.json`

## 3. Decisões técnicas importantes e armadilhas evitadas

1. **Método (b) com proteção contra falsos positivos de anti-aliasing (`gerar-logo-svg.mjs`)**:
   - Na paleta `CORES`, `batentePorta` (`#CCCCC7`) cai exatamente entre `interna` (`#EBEAE6`) e `sombra` (`#C6C5C1`). Uma quantização ingênua classificaria pixels de transição da borda 8× MSAA da sombra como filetes falsos de `#CCCCC7`.
   - Solução: classificação em duas etapas — primeiro somente pixels exatos (`±1` em RGB, `alpha ≥ 250`) filtrando ilhas minúsculas (`< 40 px` em `4096²`); depois pixels de borda só escolhem entre rótulos exatos presentes na vizinhança local, e na fronteira `interna`↔`sombra` extrai-se o campo contínuo `sombraFrac ∈ [0, 1]` para Marching Squares subpixel.
   - **Zero fresta de AA na borda de sombra**: a camada `interna` (`#EBEAE6`) cobre a união `interna ∪ sombra` por baixo da camada `sombra` (`#C6C5C1`), fazendo a borda anti-aliased da sombra compor diretamente sobre `#EBEAE6` sem vazar papel `#FAFAF8`.
   - **XML estrito**: todos os atributos `data-*` nos SVGs usam valor explícito (`data-logo-camada="contorno"` etc.) para compatibilidade total com `image/svg+xml` e `librsvg`/`sharp`.
2. **Sem `will-change-transform` nem `translate3d` em `[data-splash-svg-final]`**:
   - Com `will-change: transform` / `translate3d`, o Chromium promovia o `div` de `800×800 px` para camada GPU e fazia downscale bilinear da textura no pouso `40×40 px` (gerando borrão com `6,88%` de diff). Com `transform: translate(...) scale(...)` 2D sem `will-change`, o navegador rasteriza o SVG vetorialmente nítido em qualquer escala.
3. **Alinhamento subpixel `left: 0; top: 0` + snap de dispositivo no pouso (`animacao.ts`)**:
   - Em viewports com `scrollbar-gutter: stable` (`clientWidth = 1265` desktop, `375` mobile), `(w - lado)/2 = 232,5 px` e `(h - lado)/2 = 234,5 px`. Colocar isso em `style.left`/`style.top` fazia o layout do Blink arredondar em `+0,5 px`, deslocando as linhas de `1 px` na troca. Mover o offset inicial para `translate(svgLeft, svgTop)` zerou o diff da troca desktop (`0,0000%`) e reduziu o mobile para `0,0022%`.
   - No header (`h-16 border-b` → altura interna `63 px`), `[data-splash-alvo]` tem `top = 11,5 px` e `left = 144,5 px`, que o Blink pinta com snap para `(145, 12)` em `dpr 1`. Aplicar `Math.round(v * ratio) / ratio` ao alvo no `recalcularLayout()` reduziu o diff do recorte `56×56` no pouso de `7,27%` para **`0,0319%` (`1 / 3.136 px`)**.
4. **Compensação óptica do contorno em tamanhos pequenos**:
   - `whiteroom-logo.svg` (`1024×1024`): contorno oficial `5,50`.
   - `whiteroom-logo-header.svg` (`40×40 px`, `viewBox 580`): `5,50` renderizaria `0,38 px` (cinza lavado no topo branco em `dpr 1`); ajustado para `10,00` (`0,69 px` em `40 px`), interpolado suavemente de `5,50 → 10,00` durante o voo `2,60–3,10 s` para manter `0%` na troca e `0,03%` no pouso.
   - `public/favicon.svg` e `public/favicon.ico` (`16–48 px`, `viewBox 620`, ~6% margem): contorno `14,00` para o topo branco do cubo não desaparecer em `16×16 px` sobre fundo claro.
   - `apple-touch-icon.png`, `icon-192.png` e `icon-512.png` (`viewBox 726`, ~12% margem, fundo `#FAFAF8`): mantêm o contorno oficial `5,50` (já espesso e nítido em `180–512 px`).

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador (8 ativos) | SVG 1024 vs T2 R7 | Troca `2,59↔2,61` (Desk / Mob) | Fundo `2,85 s` / Pouso↔Header | Pose `2,4 s` vs T2 R7 | HLR médio (Desk / Mob) | Fluxo + Favicon |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Gerador método (b) + SVGs finais + troca sem pulo + voo SVG + fade fundo no voo + `pular()` + favicons/manifest + gate T5 | OK / OK / 0 err, 0 warn | 8/8 OK (`7,55 KB` / `6,81 KB`) | **`0,0000%`** (`0 px`) | **`0,0000%`** / **`0,0022%`** | **`0,50`** / **`0,0319%`** (`1 px`) | **`0,0000%`** (`0 px`) | **`0,933 ms`** / **`1,103 ms`** | **11/11 OK** |

## 5. Passagem de bastão

- Todos os critérios objetivos da T5 (e do item extra de favicon/ícones/manifest) passaram na rodada 1 com folga extrema (`0,0000%` fidelidade SVG 1024, `0,0000%` troca desktop, `0,0022%` troca mobile, `0,0319%` pouso vs header, `0,0000%` pose 2,4 s, `11/11` testes, `0` erros/avisos de console).
- Caso o crítico ou o dono peça ajuste de espessura de contorno no header (`ESPESSURA_CONTORNO_HEADER` em `tools/gauntlet/gerar-logo-svg.mjs`) ou no favicon (`ESPESSURA_CONTORNO_FAVICON`), basta alterar a constante, rodar `node tools/gauntlet/gerar-logo-svg.mjs` (o `logo.ts` lê automaticamente o novo `stroke-width` e `viewBox` do SVG gerado) e rodar `node tools/gauntlet/t5-rodada.mjs <n>`.
