# T2 Rodada 7 — Notas de Investigação e Correção (Linhas de Construção + Antialiasing)

## 1. Causas encontradas (diagnóstico antes de editar, commit `02d9896`)

A investigação combinou inspeção do DOM/SVG/WebGL em três perfis de tela (`1024×1024` dpr 1, `1280×800` dpr 1,25 e `390×844` dpr 3) e recortes 4× nearest-neighbor:

1. **Cor e contraste excessivos + piso de espessura distorcido em mobile (`constantes.ts`, `linhas/svg.ts`)**:
   - `CORES.linhaConstrucao = '#343432'` sobre `#FAFAF8` tinha contraste ~12:1 com espessura `1,45 px` em 1024. Em retas diagonais a ~28,8° (`dy/dx = 0,550`), contraste muito alto realça a periodicidade de subpixel ("efeito escadinha") em dpr 1 e faz o esboço competir visualmente com o contorno principal (`#171717`).
   - Em `linhas/svg.ts`, o piso `Math.max(0.75, ...)` travava a espessura em `0,75 CSS px` em telas estreitas (`390×844`), o que em dpr 3 virava `2,25 px` físicos (~36% mais grosso proporcionalmente do que em 1024).

2. **Entortamento e quantização das linhas de construção (`linhas/index.ts`, `linhas/encadear.ts`, `linhas/svg.ts`)**:
   - `segsConstrucao` passava por `encadearEmPolilinhas()`, que soldava vértices próximos (`TOL_SNAP_VERTICE_PX = 0,55 px`) pela média aritmética (`v.sx / v.n`) e encadeava hastes de direções distintas com junção `miter`. Somado ao arredondamento a `0,1 px` em `fmtCoord()` (`0,3 px` físicos em dpr 3), hastes perfeitamente verticais entortavam:
     - Em `1024×1024` dpr 1: `B_front -Y` virava `M511.4 783.2L511.5 833.2`.
     - Em `390×844` dpr 3: a haste vertical superior esquerda virava `L103.6 367.4L103.7 343.5`, produzindo um degrau visível no meio da haste (confirmado em `zoom-antes-depois.png` painel `(a)` Antes · dpr 3).
   - Em `deduplicarEFundirColineares()`, a reta suporte `(ux, uy, d)` era ancorada pelo primeiro segmento da lista (que podia ser um trecho curto pós-corte, com menor precisão angular).

3. **Desalinhamento CSS ↔ Canvas ↔ SVG por `scrollbar-gutter: stable` + teto `dpr = 2` (`debug.ts`, `cubo.ts`)**:
   - `src/styles/global.css` define `html { scrollbar-gutter: stable; }`, fazendo `#wr-splash` (`fixed inset-0`) ter `clientWidth = innerWidth - 15` (`1265` em `1280×800`, `375` em `390×844` desktop/Playwright). Porém `debug.ts` chamava `cena.redimensionar(window.innerWidth, window.innerHeight)`, espremendo o `<canvas>` só em X (escala não-uniforme) enquanto o `<svg>` encolhia em X e Y via `preserveAspectRatio="xMidYMid meet"`. Isso gerava borrão bilinear no WebGL e desalinhamento/halo fantasma entre formas e contorno (confirmado em `zoom-antes-depois.png` painéis `(a)` e `(c)` Antes · dpr 3).
   - Em `cubo.ts`, `Math.min(dpr, 2)` limitava o buffer WebGL a `dpr = 2`, forçando upscaling `1,5×` em celulares `dpr = 3`.

4. **Bordas binárias (zero antialiasing) nas sombras e cortes analíticos no fragment shader (`materiais.ts`)**:
   - MSAA 4× do WebGL só atua em bordas de triângulos, não em transições feitas no fragment shader.
   - A cunha de sombra usava `BasicShadowMap` + `if (wrVis < 0.5) wrEmSombra = 1.0;` (degrau binário de 1 px, painel `(c)` Antes · dpr 1).
   - Os cortes internos no furo do R (`wrYmm > wrYCorte`) e no vão de `fundo-direita` (`wrYmm < wrYDiag`) também usavam ternário binário `? 1.0 : 0.0` (painel `(d)` Antes · dpr 1).

## 2. O que mudou e por quê

- **`src/scripts/splash/cena/constantes.ts`**:
  - `CORES.linhaConstrucao`: `'#343432'` → **`'#A8A8A4'`** (sem `opacity`).
  - `ESPESSURA_LINHA_CONSTRUCAO_1024_PX`: `1.45` → **`1.15`**.
  - Contorno preto (`#171717`, `5.5 px`), cores das faces, geometria e `DIRECAO_LUZ_RAW` intactos.
- **`src/scripts/splash/cena/linhas/encadear.ts`**:
  - `deduplicarEFundirColineares` agora ordena segmentos por comprimento decrescente antes de criar cada `RetaSuporte`, ancorando a direção pelo maior trecho disponível.
- **`src/scripts/splash/cena/linhas/index.ts`**:
  - `segsConstrucao` (já deduplicados e fundidos por reta suporte) passam a ser emitidos diretamente como segmentos retos puros de 2 pontos, sem `encadearEmPolilinhas` (elimina deslocamento de vértices e dobras `miter` entre hastes).
- **`src/scripts/splash/cena/linhas/svg.ts`**:
  - Precisão de `fmtCoord` elevada de `0,1 px` para **`0,01 px`**.
  - Piso de espessura de construção ajustado de `0,75` para **`0,45 CSS px`** (`0,45 CSS px = 1,35 px` físicos em celular 390 px dpr 3; `1,15 px` em 1024).
  - Inicialização de `ultimaLargura`/`ultimaAltura` para `-1` garantindo `width`/`height`/`viewBox` sempre sincronizados no primeiro frame.
  - `paraSvgString()` reflete automaticamente `#A8A8A4`, espessura atualizada e coordenadas `0,01 px`.
- **`src/scripts/splash/cena/cubo.ts`**:
  - Limite de `pixelRatio` elevado de `2` para **`3`** (`Math.min(dpr ?? (window.devicePixelRatio || 1), 3)`), eliminando upscaling em telas dpr 3.
- **`src/scripts/splash/cena/debug.ts`**:
  - `ajustarLayout()` em `/?debug` e `/?debug=hlr` usa `overlayEl.clientWidth || window.innerWidth` e `overlayEl.clientHeight || window.innerHeight` (com `ResizeObserver` em `/?debug`), mantendo `<canvas>` e `<svg>` 1:1 com a caixa CSS real e perfeitamente alinhados.
- **`src/scripts/splash/cena/materiais.ts`**:
  - Sombra do shadow map (`BasicShadowMap` 4096²): superamostragem 8× em subpixel de tela usando `dFdx`/`dFdy` de `vDirectionalShadowCoord[0]` no padrão MSAA 8× dentro de `[-0.4375, +0.4375]` px. Longe da borda (> 0,5 px), todas as 8 amostras concordam → **sombra 100% dura em dois tons (`#EBEAE6` / `#C6C5C1`), zero borrão**; exatamente na borda (1 px físico), gera antialiasing suave em 9 níveis.
  - Cortes analíticos do furo do R e do vão de `fundo-direita`: `smoothstep(-0.5 * fwidth(d), 0.5 * fwidth(d), d)` para antialiasing exato de 1 px físico sem alterar tons nem posições.

## 3. Cor e espessura escolhidas (justificativa visual)

- **Cor**: `#A8A8A4` (ponto central da faixa pedida `#9E9E9A`–`#B4B4B0`, mantendo o subtom neutro-quente alinhado a `#FAFAF8` e `#EBEAE6`, sem `opacity`).
- **Espessura**: `1,15 px` em 1024 (`0,90 CSS px` em 1280×800 dpr 1,25; `0,45 CSS px` / `1,35 px` físicos em 390×844 dpr 3).
- **Justificativa pelos prints**: em `captura.png` (dpr 1), `depois-dpr125.png` (desktop 125%) e `zoom-antes-depois.png` (dpr 1 e dpr 3), `#A8A8A4` em `1,15 px` deixa os 6 asteriscos e prolongamentos claramente legíveis como linhas de esboço técnico leves e contínuas, sem escadinha de alto contraste e sem brigar com o contorno `#171717` (`5,5 px`). Tons acima de `#B0B0AC` a `1,0 px` ficavam excessivamente apagados nas diagonais em dpr 1.

## 4. Métricas e desempenho medidos

- **Gate (`node tools/gauntlet/t2-rodada.mjs 7`)**:
  - `astro check`: OK (`0 errors, 0 warnings, 0 hints`).
  - `astro build`: OK.
  - Console do navegador: `0 erros`, `0 avisos`, `0 pageErrors`.
  - `diff%` (`threshold: 0.1`): **`2,4670%`** (`25.868 / 1.048.576 px`) — caiu em relação à rodada 6 (`2,5312%` / `26.542 px`).
  - Cores amostradas (mediana 5×5): todas preservadas (`Δmax = 0..2`, topo branco `5`, `cunha_sombra = #c6c5c1`, `face_interna = #ebeae6`, `sombra_sob_r = #b3b4ae`).
- **Benchmark `/?debug=hlr` (80 quadros ativos em movimento)**:
  - **Desktop `1280×800` dpr 1**: HLR `atualizar()` média **`2,23 ms`** (meta ≤ 4 ms), p95 `6,00 ms`, tempo médio de quadro **`13,51 ms`** (p95 `13,4 ms`). *(Antes: HLR `1,58 ms`, quadro `15,19 ms`.)*
  - **Mobile `390×844` dpr 3** (`canvas` `1125×2532` nativo): HLR `atualizar()` média **`1,63 ms`**, p95 `3,00 ms`, tempo médio de quadro **`13,34 ms`** (p95 `13,4 ms`). *(Antes com dpr capado em 2: HLR `1,66 ms`, quadro `13,34 ms` — zero regressão de fluidez ao subir para dpr 3.)*
- **Evidência visual**: `docs/gauntlet/t2/rodada-7/zoom-antes-depois.png`.
