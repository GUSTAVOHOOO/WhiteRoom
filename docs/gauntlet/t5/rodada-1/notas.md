# T5 Rodada 1 — Notas: Logo SVG Final do 3D, Troca sem Pulo, Voo SVG e Favicons

## 1. Método escolhido para vetorização das faces e sombras

Escolhido o **método (b)** — renderização em alta resolução (`4096×4096`, `dpr = 1`, fundo transparente) + quantização protegida para a paleta `CORES` + **Marching Squares contínuo** + simplificação **Ramer-Douglas-Peucker** subpixel — combinado diretamente com os caminhos vetoriais exatos do HLR (`dConstrucao` e `dContorno` em `1024×1024`).

### Justificativa
- A cena 3D usa máscaras analíticas no fragment shader (`wrEstaADireitaDoR`, máscara do ombro do R, cortes diagonais do furo do R e da parede `fundo-direita`) além de shadow map `4096²` com superamostragem `8×` nas bordas de sombra. Projetar e unir triângulos na CPU (método a) exigiria duplicar todo o shader de recorte e o shadow mapping 3D na CPU com risco de divergência de geometria/sombra.
- Com o método (b) em `4096×4096` (4× a referência `1024×1024`, ou seja `0,25 px` por amostra):
  1. O modo dedicado `/?debug=export-svg` extrai na mesma pose o HLR exato em `1024×1024` e o framebuffer WebGL transparente em `4096×4096` sem linhas sobrepostas.
  2. **Proteção de paleta**: `batentePorta` (`#CCCCC7`) tem RGB intermediário entre `interna` (`#EBEAE6`) e `sombra` (`#C6C5C1`). Classificar primeiro apenas pixels exatos (`±1` em RGB, `alpha ≥ 250`, removendo ilhas `< 40 px`) e restringir pixels de borda aos rótulos exatos da vizinhança local elimina 100% dos filetes falsos de `#CCCCC7` ao longo das bordas de sombra.
  3. **Precisão subpixel na sombra**: na fronteira `interna`↔`sombra` (únicas bordas sem contorno preto por cima), o algoritmo projeta o RGB do pixel no segmento `interna → sombra` para obter o campo contínuo `sombraFrac ∈ [0, 1]` de 8 níveis MSAA e aplica Marching Squares em `iso = 0,5`, acertando a reta da sombra com precisão subpixel (`< 0,05 px` em `1024`).
  4. **Zero fresta de AA**: a camada `interna` (`#EBEAE6`) cobre a união `interna ∪ sombra`, com `sombra` (`#C6C5C1`) pintada por cima — evitando qualquer linha clara de fundo vazando entre polígonos adjacentes.
  5. **Leveza**: tolerância RDP de `0,24 px` na sombra e `0,30 px` nas demais faces (todas cobertas pelo contorno preto de `5,50 px`) colapsa todas as escadas isométricas em segmentos puros, resultando em apenas `214` vértices no total das 7 camadas de cor (`whiteroom-logo.svg` = **`7,55 KB`**, quase 4× abaixo do teto de `30 KB`, sem gradientes, filtros ou imagens embutidas).

## 2. Troca 3D → SVG, voo, fade do fundo e `pular()`

- **Troca em `2,60 s`**: `[data-splash-svg-final]` substitui `canvas` e `[data-splash-linhas]` no mesmo quadro (`t ≥ 2,60 s`). Durante `2,60–3,10 s`, o WebGL e o HLR não são mais executados.
- **Correções descobertas no gate durante a rodada 1**:
  1. *Borrão de textura GPU*: inicialmente `[data-splash-svg-final]` usava `will-change-transform` e `translate3d(...)`, fazendo o Chromium rasterizar o SVG a `800×800 px` e aplicar downscale bilinear GPU no pouso (`6,88%` de diff). Remover `will-change-transform` e usar `translate(x, y) scale(s)` 2D devolveu rasterização vetorial nítida em todas as escalas.
  2. *Snap de layout de `0,5 px`*: em `1280×800` (`clientWidth = 1265`), `(1265 - 800)/2 = 232,5 px` em `style.left` e `alvoRect.top = 11,5 px` sofriam snap de `+0,5 px` no layout do Blink. Manter `left: 0; top: 0` (aplicando o deslocamento inicial no `transform`) e aplicar `Math.round(v * dpr) / dpr` ao retângulo do header no pouso zerou o diff da troca desktop (`0,0796% → 0,0000%`), reduziu o mobile (`0,197% → 0,0022%`) e derrubou o diff pouso↔header de `7,27%` para **`0,0319%` (`1 / 3.136 px`)**.
- **Fades durante o voo (`2,60–3,10 s`)**:
  - Linhas de construção (`[data-logo-camada="construcao"]`): `1 → 0` em `2,60–2,90 s` (`power2.inOut`), completamente invisíveis antes do pouso.
  - Fundo da splash (`[data-splash-fundo]`): `1 → 0` em `2,60–3,10 s` (`power2.inOut`), medido em **`0,50`** exato aos `2,85 s` e **`0,00`** aos `3,10 s`. Removido o fade tardio pós-`tocar()`/`pular()` em `controlador.ts`.
  - Compensação óptica do contorno no header: `whiteroom-logo-header.svg` (`viewBox="221.46 220.17 580 580"`) usa `stroke-width="10.00"` (`≈ 0,69 px` em `40×40 px`) para manter o contorno do topo branco firme e legível em `dpr 1` (em `5,50`, `0,38 px` ficava cinza lavado). Durante o voo `2,60–3,10 s`, o contorno do SVG voador interpola suavemente `5,50 → 10,00` (`power2.inOut`), mantendo `5,504` em `2,61 s` e casando exatamente com o header em `3,10 s`.
- **`pular()`**:
  - Pose final completa (`t ≥ 2,15 s`) ou já em voo (`t ≥ 2,60 s`): oculta 3D imediatamente e completa o voo SVG até o header em `~300 ms` (ou proporcional ao restante).
  - Meio da montagem (`t < 2,15 s`): exibe `[data-splash-svg-final]` na pose final no lugar do cubo, faz fade do 3D parado em `100 ms` e voa o SVG em `300 ms`. O 3D (`raizCubo`) permanece sempre em escala `1` e nunca aparece encolhido no header.
- **Reservas e remoção da provisória**: `Header.astro` usa `whiteroom-logo-header.svg`; fallback e movimento reduzido (`[data-splash-logo]`) usam `whiteroom-logo.svg` mantendo a regra de nunca aparecer no carregamento normal; `src/assets/logo/logo-provisoria.svg` foi removida.

## 3. Favicons, ícones e manifest (item extra do dono)

Gerados pelo mesmo `tools/gauntlet/gerar-logo-svg.mjs` a partir da logo sem linhas de construção:
- `public/favicon.svg` (`6,81 KB` / `6.971 B`): `viewBox="201.46 200.17 620 620"` (~6% de margem ao redor do cubo), fundo transparente. Em `16×16 px`, o contorno de `5,50` desaparecia no topo branco; **engrossado apenas o contorno para `14,00`** (formas e cores inalteradas), garantindo leitura clara em `16, 32 e 48 px` tanto em abas claras (`#FAFAF8`) quanto escuras (`#202124`).
- `public/favicon.ico` (`4,85 KB` / `4.969 B`): container ICO multi-tamanho (`16×16`, `32×32`, `48×48`, PNG dentro de ICO) gerado em Node sem dependências extras.
- `public/apple-touch-icon.png` (`7,43 KB` / `7.610 B`, `180×180`), `public/icon-192.png` (`7,95 KB` / `8.141 B`, `192×192`), `public/icon-512.png` (`21,26 KB` / `21.766 B`, `512×512`): fundo `#FAFAF8`, ~12% de margem (`viewBox 726×726`), contorno oficial `5,50`.
- `public/site.webmanifest` (`0,34 KB` / `347 B`): `name: "WhiteRoom"`, ícones `192` e `512`, `theme_color: "#FAFAF8"`, `background_color: "#FAFAF8"`, `display: "browser"`.
- `src/layouts/Base.astro`: adicionados `sizes="any"` em `/favicon.ico`, `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` e `<link rel="manifest" href="/site.webmanifest" />`.

## 4. Métricas do gate (`docs/gauntlet/t5/rodada-1/metricas.json`)

- **`astro check`**: OK (`11,00 s`, 0 erros, 0 avisos, 0 hints).
- **`astro build`**: OK (`5,02 s`).
- **Console do navegador**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Reprodutibilidade do gerador**: **8/8 ativos byte-a-byte idênticos**; zero gradientes/filtros/imagens; `logo-provisoria.svg` removida.
  - `src/assets/logo/whiteroom-logo.svg`: **`7,55 KB`** (`7.732 B`, meta `≤ 30 KB`).
  - `src/assets/logo/whiteroom-logo-header.svg`: **`6,81 KB`** (`6.971 B`).
- **Fidelidade SVG 1024×1024 vs `t2/rodada-7/captura.png`** (`pixelmatch threshold 0.1`):
  - **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,5%`).
- **Troca 3D (`t=2,59 s`) → SVG (`t=2,61 s`)** (`pixelmatch threshold 0.1`):
  - Desktop `1280×800 dpr 1`: **`0,0000%`** (`0 / 1.024.000 px`, meta `≤ 0,5%`).
  - Mobile `390×844 dpr 3`: **`0,0022%`** (`65 / 2.962.440 px`, meta `≤ 0,5%`).
- **Voo, fade do fundo e recorte 4× do header**:
  - Opacidade do fundo em `2,85 s`: **`0,50`** (em `3,10 s`: `0,00`).
  - Linhas de construção: `1,00` em `2,60 s` → `0,50` em `2,75 s` → `0,00` em `2,90 s` e `3,10 s`.
  - Diff do recorte `56×56` do header (`3,10 s` vs pós-splash): **`0,0319%`** (`1 / 3.136 px`), sem pontos soltos nem degraus.
- **Pose final T4 (`t=2,4 s`, 1024×1024 vs T2 R7)**: **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,3%`).
- **Desempenho (`/?debug=t4`)**:
  - Desktop `1280×800 dpr 1`: rAF médio **`13,390 ms`** (`p95 14,2`), trabalho **`1,182 ms`** (`p95 3,9`), HLR **`0,933 ms`** (`p95 3,3`, meta `≤ 4 ms`).
  - Mobile `390×844 dpr 3`: rAF médio **`13,256 ms`** (`p95 14,3`), trabalho **`1,354 ms`** (`p95 4,4`), HLR **`1,103 ms`** (`p95 3,4`, meta `≤ 4 ms`).
- **Testes de fluxo, regressão e favicons**: **11/11 OK** (`fluxoNormalEReload`, `headerLogoNova`, `pularMeioMontagem` `309 ms`, `pularPosTroca` `306 ms`, `pularEsc` `297 ms`, `movimentoReduzido` `968 ms`, `fallbackFalha`, `regressaoDebugT2`, `determinismoEResize`, `estabilidadePosImpacto`, `faviconEManifest` com todas as 6 rotas HTTP 200 e os 4 `<link>` no `<head>`).

## 5. Evidências geradas

- `docs/gauntlet/t5/rodada-1/folha-contato.png`
- `docs/gauntlet/t5/rodada-1/favicon.png`
- `docs/gauntlet/t5/rodada-1/header-3.10s-4x.png` e `header-pos-splash-4x.png`
- `docs/gauntlet/t5/rodada-1/svg-completo-1024.png` e `svg-completo-diff.png`
- `docs/gauntlet/t5/rodada-1/troca-{2.59s,2.61s,diff}-{desktop,mobile}.png`
- `docs/gauntlet/t5/rodada-1/voo-{2.60,2.75,2.90,3.00,3.10}s-desktop.png`, `pos-splash-desktop.png`
- `docs/gauntlet/t5/rodada-1/pose-final-1024.png` e `pose-final-diff.png`
- `docs/gauntlet/t5/rodada-1/metricas.json`
