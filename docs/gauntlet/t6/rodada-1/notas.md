# T6 — Rodada 1: Notas de Auditoria e Correções (Celular e Tablet)

Data: 2026-11-24 · Branch: `GUSTAVOHOOO/splash-t6-celular` · Base: `e74177f docs: handoff atualizado apos merge da T5`.

## 1. Resumo da Auditoria Baseline vs. Final

Antes de editar qualquer arquivo em `src/`, medimos o comportamento da splash da T5 nos 8 viewports e sob throttling de CPU 1×/4×/6× em `390×844 dpr 3`.

### O que estava fora da meta e foi corrigido
1. **Tamanho do cubo em retrato e tablet** (`390×844`, `360×740`, `320×568`, `768×1024`):
   - **Baseline**: `46,74%` da menor dimensão (abaixo da meta de `50–60%`, alvo `~55%`).
   - **Correção**: `calcularEscalaEnquadramento(w, h)` em `src/scripts/splash/cena/camera.ts` aplica `ESCALA_ENQUADRAMENTO_RETRATO = 1.175` somente quando `h > w`, com `lado = Math.round(Math.min(w, h) * escalaEnquadramento)`. Propagado para câmera ortográfica, HLR (`escalaCubo` + espessuras em `linhas/svg.ts`), `[data-splash-svg-final]` e `[data-splash-logo]` em retrato (`@media (orientation: portrait)` em `global.css`).
   - **Resultado**: **`54,89%–54,92%`** em retrato e tablet; paisagem baixa (`844×390`, `740×360`) permanece em `46,74%` com folga vertical e sem encostar no header; desktop `1280×800`, `1920×1080` e `1024×1024` mantêm **`0,0000%` de diff** contra T5 e T2 R7.
2. **Altura dinâmica e bloqueio de rolagem no celular**:
   - **Baseline**: `[data-splash-logo]` usava `max-w-[100vh]` em `Splash.astro`; `#wr-splash` não tinha `touch-action: none` nem `overscroll-behavior: none`; `html.splash-ativa` não travava `body` nem `height: 100%` (permitindo `scrollY = 300` sob `isMobile: true`).
   - **Correção**: trocado `100vh` por `100dvh`, adicionado `overflow-hidden overscroll-none touch-none` em `#wr-splash`, `html.splash-ativa, html.splash-ativa body { overflow: hidden; overscroll-behavior: none; height: 100%; }` em `global.css`, e listener `touchmove` (`passive: false`) em `controlador.ts`.
   - **Resultado**: `scrollY = 0` durante a splash (tanto por arrasto quanto programático), `visualViewport.scale = 1`, cobertura total ao variar altura da barra de endereço (`844 → 760 px`), e rolagem restaurada após o fim (`scrollY = 300`).
3. **Toque para pular e proteção contra clique fantasma**:
   - **Baseline**: `onPointerDown` em `controlador.ts` não chamava `preventDefault()`/`stopPropagation()` nem suprimia o evento `click` sintetizado após `touchend`.
   - **Correção**: `onPointerDown` previne o comportamento padrão e arma um filtro temporário em captura de `click` (até 500 ms ou até o próximo `pointerdown` após `finalizar()`), além de ouvir `orientationchange` e `visualViewport.resize`.
   - **Resultado**: pular em `323 ms`, `0` cliques fantasma sobre o link do header por baixo, toque deliberado seguinte funciona normalmente, toque duplo idempotente (`321 ms`, 0 erros).
4. **Pouso no header em `390×844 dpr 3`**:
   - **Baseline**: `snapDevicePx` arredondava `alvoRect.top = 11,5 px` para `35/3 = 11,67 px` enquanto o Blink faz layout snap de `11,5 px` para `12 px` (`36 px` físicos em dpr 3), gerando `1,6546%` de diff no recorte 4× do header.
   - **Correção**: `snapDevicePx = (v) => Math.round(v)` (alinhado ao snap em CSS px do Blink, idêntico ao desktop `dpr 1`) + `lado` inteiro em CSS px.
   - **Resultado**: diff no recorte 4× do header em `390×844 dpr 3` caiu de `1,6546%` para **`0,0035%`** (`1 / 28.224 px`, meta ≤ `0,5%`); troca `2,59 ↔ 2,61 s` no mobile = **`0,0004%`** (`11 / 2.962.440 px`).
5. **Desempenho sob CPU 4× em `390×844 dpr 3`**:
   - **Antes da otimização (`dpr 3` no WebGL)**: em CPU 4×, `pronto = 620,4 ms`, `rAF med = 14,23 ms`, `p95 = 39,6 ms` (> 33 ms), `max = 95,0 ms`, `18/203` quadros > 33 ms.
   - **Otimização aplicada só no celular**: em `animacao.ts`, quando `Math.min(w, h) <= 500`, limita `renderer.setPixelRatio` a no máximo `2` (reduzindo ~55,6% dos pixels rasterizados no canvas em aparelhos `dpr 3`, enquanto `<svg data-splash-linhas>` e `[data-splash-svg-final]` continuam vetoriais na resolução nativa). Não foi necessário alterar o shader de sombra (AA 8× intacto).
   - **Ganho medido**: em CPU 4×, `pronto` caiu de `620,4 ms` para **`474,3 ms`** (`-146,1 ms`), `rAF med` de `14,23 ms` para **`10,36 ms`**, `p95` de `39,6 ms` para **`20,4 ms`** (`-19,2 ms`, bem abaixo de 33 ms), `max` de `95,0 ms` para **`47,3 ms`**, quadros > 33 ms de `18/203` para **`3/296`**.
   - **Fidelidade visual da otimização**: diff pixelmatch entre `390×844 dpr 3` sem otimização (WebGL `dpr 3`) e com otimização (WebGL `dpr 2`) em `t = 2,40 s` = **`0,0000%` (`0 / 2.962.440 px`)** (meta ≤ `0,5%`).

### O que já estava dentro da meta (sem alteração)
- **Paisagem baixa (`844×390`, `740×360`)**: cubo em `46,74%`, cabe inteiro com folga vertical (`+26,3 px` / `+19,4 px` abaixo do header; `91,8 px` / `84,7 px` na base).
- **Entradas fora da tela**: em todos os 8 viewports, nenhuma peça visível em `t = 0` e `t = 0,25 s`; W entra de fora pelo canto inferior esquerdo, R pelo inferior direito e quarto de cima.
- **Coreografia, geometria, perfis, cores, luz, shader de sombra, SVGs e favicons**: 100% intocados (`gerar-logo-svg.mjs --check` 9/9 byte a byte).
- **Movimento reduzido e fallback no celular (`390×844`)**: funcionando como no desktop (`962 ms` e `567 ms`).

## 2. Tabela de Fração do Cubo (`t = 2,4 s`)

| Viewport | Tipo | Container | Cubo (`L × A`) | Fração da menor dim. | Folga header | Folga base | Status |
|---|---|---|---|---|---|---|---|
| `390×844` dpr 3 | Retrato | `390×844` | `214,07 × 244,13 px` | **54,89%** | `+235,1 px` | `300,8 px` | OK (50–60%) |
| `360×740` dpr 3 | Retrato | `360×740` | `197,71 × 225,49 px` | **54,92%** | `+192,5 px` | `258,0 px` | OK (50–60%) |
| `320×568` dpr 2 | Retrato | `320×568` | `175,74 × 200,43 px` | **54,92%** | `+119,1 px` | `184,5 px` | OK (50–60%) |
| `844×390` dpr 3 | Paisagem | `844×390` | `182,29 × 207,88 px` | **46,74%** | `+26,3 px` | `91,8 px` | OK (cabe c/ folga) |
| `740×360` dpr 3 | Paisagem | `740×360` | `168,26 × 191,91 px` | **46,74%** | `+19,4 px` | `84,7 px` | OK (cabe c/ folga) |
| `768×1024` dpr 2 | Tablet | `768×1024` | `421,59 × 480,85 px` | **54,89%** | `+206,0 px` | `273,2 px` | OK (50–60%) |
| `1280×800` dpr 1 | Desktop | `1265×800` | `373,92 × 426,47 px` | **46,74%** | `+121,3 px` | `188,2 px` | OK (`0,0000%` vs T5) |
| `1920×1080` dpr 1 | Desktop | `1905×1080` | `504,80 × 575,75 px` | **46,74%** | `+186,2 px` | `254,1 px` | OK (inalterado) |

## 3. Tabela de Desempenho (`390×844 dpr 3`, `0–3,1 s`)

| Throttling CPU | 3D pronto (ms) | Fallback | rAF média (ms) | rAF p95 (ms) | rAF máx (ms) | Quadros > 33 ms | Trabalho med / p95 (ms) | HLR med / p95 (ms) |
|---|---|---|---|---|---|---|---|---|
| **1×** | `136,6 ms` | Não | `8,59` | `9,30` | `71,30` | `2 / 389` | `1,31 / 3,50` | `1,05 / 2,90` |
| **4×** (celular médio) | `474,3 ms` | Não | `10,36` | `20,40` | `47,30` | `3 / 296` | `4,18 / 15,00` | `3,40 / 13,00` |
| **6×** (celular fraco) | *(>800 ms / fallback)* | *(timeout 800 ms)* | `14,37` | `36,20` | `84,20` | `15 / 237` | `6,13 / 24,30` | `5,29 / 19,90` |

## 4. Evidências Geradas
- Folha de contato (6 tamanhos × 8 tempos): `docs/gauntlet/t6/rodada-1/folha-contato.png`
- Métricas completas: `docs/gauntlet/t6/rodada-1/metricas.json`
- Recortes 4× do pouso no header mobile: `docs/gauntlet/t6/rodada-1/header-mobile-3.10s-4x.png` e `header-mobile-pos-splash-4x.png`
- Rotação em `t = 1,0 s` e `t = 2,7 s`: `docs/gauntlet/t6/rodada-1/rotacao-1.0s-{antes,depois}.png` e `rotacao-2.7s-{antes,depois}.png`
