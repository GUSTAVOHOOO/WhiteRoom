# T6 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 1)

Branch: `GUSTAVOHOOO/splash-t6-celular` · Base: `e74177f docs: handoff atualizado apos merge da T5`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json`).
Coreografia `0–3,10 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`), shader de sombra (AA 8×), logos SVG (`whiteroom-logo.svg`, `whiteroom-logo-header.svg`) e todos os favicons/ícones estão **intactos** (`gerar-logo-svg.mjs --check` = 9/9 byte a byte). Desktop `1280×800` e `1920×1080` permanecem **0,0000% diff** contra T5.

## 1. Arquitetura das Mudanças da T6

| Arquivo | Papel na T6 |
|---|---|
| `src/scripts/splash/cena/camera.ts` | Adicionados `ESCALA_ENQUADRAMENTO_RETRATO = 1.175` e `calcularEscalaEnquadramento(largura, altura)` (retorna `1.175` quando `altura > largura`, `1` caso contrário). `atualizarEnquadramentoCamera(camera, w, h, escalaEnquadramento = 1)` usa `lado = Math.round(Math.min(w, h) * escalaEnquadramento)`. Retrocompatível com T2/T4/T5 (`default = 1`). |
| `src/scripts/splash/cena/linhas/svg.ts` | Quando `escalaCubo > 1` (retrato), aplica `Math.max(piso, espBase * escala * fator)` para manter a espessura das linhas HLR idêntica à do `whiteroom-logo.svg` ampliado em retrato. Quando `escalaCubo === 1` (desktop/paisagem/T2), comportamento bit-a-bit idêntico. |
| `src/scripts/splash/animacao.ts` | (1) `recalcularLayout()` usa `escalaEnquadramento = calcularEscalaEnquadramento(w, h)` e `lado = Math.round(Math.min(w, h) * escalaEnquadramento)` propagado para câmera, HLR (`escalaCubo`) e `[data-splash-svg-final]`; (2) `dprReal` (sem teto) separado de `ratio` do WebGL (`<= 2` em `<= 500 px`), com `snapLayoutCssPx = (v) => Math.round(v)` para acompanhar o `PixelSnappedIntRect` em CSS px do Blink em todos os DPRs (pouso↔header: `0,0035%` em `390×844 dpr 3`, `0,0000%` em `1280×800 dpr 1,25/1,5`, `0,0080%` em `1280×800 dpr 2`, `0,0204%` em `1366×768 dpr 1,25`); (3) limita o `pixelRatio` do WebGL a `2` somente quando `Math.min(w, h) <= 500` (`0,0000%` de diff visual); (4) ouve `orientationchange` e `visualViewport.resize` (limpos no `destruir()`). |
| `src/components/Splash.astro` | `#wr-splash` ganha `overflow-hidden overscroll-none touch-none` (mantendo `fixed inset-0`); `[data-splash-logo]` troca `max-w-[100vh]` por `max-w-[100dvh]`. |
| `src/styles/global.css` | `#wr-splash` com `touch-action: none; overscroll-behavior: none;`; `html.splash-ativa, html.splash-ativa body` com `overflow: hidden; overscroll-behavior: none; height: 100%;`; `@media (orientation: portrait)` ajusta `#wr-splash [data-splash-logo]` para `width: 117.5%; max-width: none;` (mesma proporção ~55% no fallback e movimento reduzido em retrato). |
| `src/scripts/splash/controlador.ts` | `onPointerDown` chama `preventDefault()` + `stopPropagation()` e arma supressão em fase de captura do `click` sintetizado do mesmo toque (500 ms ou até o próximo `pointerdown` pós-`finalizar()`), eliminando clique fantasma sem bloquear toques deliberados seguintes; adiciona `touchmove` (`passive: false`) em `overlayEl` e listeners `orientationchange` / `visualViewport.resize` (todos removidos no `finalizar()`). |
| `tools/gauntlet/t6-rodada.mjs` | Gate completo da T6 na porta `4403` (sempre desligado no `finally`): `astro check`, `astro build`, `gerar-logo-svg.mjs --check` (9/9), enquadramento nos 8 viewports + capturas nos 8 tempos (`0 · 0,25 · 0,7 · 1,25 · 1,9 · 2,4 · 2,75 · 3,1 s`), entradas fora da tela, diff desktop vs T5 (`≤ 0,1%`) e pose 1024 vs T2 R7, altura dinâmica e rolagem, testes de toque (pular, sem clique fantasma, drag sem scroll/zoom, toque duplo), rotação em `t=1,0 s` e `t=2,7 s` com capturas antes/depois, pouso mobile `390×844 dpr 3` com recorte 4× (`≤ 0,5%`) e troca `2,59↔2,61`, benchmark CDP CPU `1×/4×/6×`, reduzido/fallback mobile, 11 fluxos de regressão da T5, `folha-contato.png` e `metricas.json`. |

## 2. Como rodar o gate da T6

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Rodar o gate completo da T6 (rodada <n>)
node tools/gauntlet/t6-rodada.mjs <n>
```

## 3. Decisões técnicas e armadilhas evitadas

1. **Snap de coordenadas do pouso em todos os DPRs (`1`, `1,25`, `1,5`, `2`, `3`)**: `Header.astro` gera `alvoRect.top = 11,5 px` e `alvoRect.left = 144,5 / 187,5 px` (com `scrollbar-gutter: stable`). O Blink aplica layout snapping em CSS pixels inteiros (`PixelSnappedIntRect`: `12`, `145`, `188`) antes da escala de DPR. Testamos `Math.round(v * dprReal) / dprReal` (usando `dprReal` sem teto) e ele produziu `1,66%` (`390×844 dpr 3`), `10,14%` (`1280×800 dpr 1,25`), `8,72%` (`1280×800 dpr 1,5`), `7,62%` (`1280×800 dpr 2`) e `12,29%` (`1366×768 dpr 1,25`). Com `snapLayoutCssPx = (v) => Math.round(v)`, todos caíram para **`0,0000%–0,0204%`** (`0,0000%` em `1,25`/`1,5`, `0,0080%` em `2`, `0,0204%` em `1366×768 dpr 1,25`, `0,0035%` em `390×844 dpr 3`), e a troca `2,59↔2,61` permaneceu `0,0000%–0,0004%`.
2. **Largura inteira `lado = Math.round(Math.min(w, h) * escalaEnquadramento)`**: evita que `390 × 1,175 = 458,25 px` gere subpixel no `transform-origin` do `[data-splash-svg-final]` e desalinhamento de `0,25 px` no pouso.
3. **Bloqueio de rolagem no mobile**: somente `html.splash-ativa { overflow: hidden }` não impedia `window.scrollTo` nem rolagem em viewport mobile; adicionar `html.splash-ativa body { overflow: hidden; height: 100%; overscroll-behavior: none; }` + `touch-action: none` + `touchmove` `preventDefault()` zerou o scroll durante a splash e restaura normalmente ao remover `splash-ativa`.
4. **WebGL `dpr <= 2` só em telas de celular (`min(w, h) <= 500`)**: em `390×844 dpr 3`, reduz os pixels do canvas de `2,96M` para `1,32M` (-55,6%), mantendo `<svg data-splash-linhas>` e `[data-splash-svg-final]` vetoriais em `dpr 3`. Diff visual medido = `0,0000%` (`0 / 2.962.440 px`), com ganho de `-146 ms` no pronto e `-19,2 ms` no `rAF p95` sob CPU 4×.

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador 9/9 | Desktop vs T5 | Retrato/Tablet fração | Paisagem folga header | Pouso `390×844` 4× / Troca | Toque / Rotação / Rolagem | CPU 4× (`pronto` / `rAF p95`) | Regressão T5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Escala retrato `1.175` (~55%), `100dvh` + trava scroll, anti-clique fantasma, snap CSS px no pouso retina, WebGL `dpr <= 2` só celular (`<= 500 px`), gate `t6-rodada.mjs` | OK / OK / 0 err, 0 warn | **9/9 OK** | **`0,0000%`** (`0 px`) | **`54,89–54,92%`** | **`+26,3` / `+19,4 px`** | **`0,0035%`** / **`0,0004%`** | **OK / OK / OK** | **`474,3 ms`** / **`20,4 ms`** | **11/11 OK** |

## 5. Passagem de bastão

- Todos os critérios do gate `tools/gauntlet/t6-rodada.mjs 1` passaram com `0` erros e `0` avisos de console.
- Evidências em `docs/gauntlet/t6/rodada-1/` (`folha-contato.png`, `metricas.json`, `notas.md`, recortes 4× do header mobile e capturas de rotação antes/depois).
- Próximo passo provável: avaliação visual do crítico / dono na folha de contato e nas capturas de celular; caso surja ajuste fino (ex.: margem em paisagem baixa ou otimização adicional para 6×), basta editar os parâmetros em `camera.ts`/`animacao.ts` e rodar `node tools/gauntlet/t6-rodada.mjs <n>`.
