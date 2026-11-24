# T4 — Estado do Gauntlet Loop (Passagem de Bastão → Rodada 5)

Branch: `GUSTAVOHOOO/splash-t4-animacao` · Base: `aa97cc5 docs: capturas de referencia do prototipo T0`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz.
Perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores das faces (`materiais.ts`, `constantes.ts`), `DIRECAO_LUZ_RAW` (`luz.ts`) e estilo das linhas (`#171717` `5,5 px` e `#A8A8A4` `1,15 px` em 1024) estão **intactos**.

## 1. Arquitetura da T4

| Arquivo | Papel na T4 |
|---|---|
| `src/styles/global.css` | Controla visibilidade inicial sem flash antes do JS: `#wr-splash [data-splash-logo]` inicia `visibility: hidden` no modo normal/debug e fica `visibility: visible` sob `html.splash-reduzida` (além de `display: grid` em `html.splash-ativa #wr-splash` e `visibility: hidden` em `[data-splash-alvo]`). |
| `src/scripts/splash/contrato.ts` | Estendido minimamente com `OpcoesAnimacaoSplash` opcional (`svgLinhas`, `container`, `dpr`) no 3º parâmetro de `CriarAnimacao`. |
| `src/scripts/splash/animacao.ts` | Substituiu o stub 2D pela animação 3D real (`criarAnimacao` e `criarAnimacaoControlavel`) usando `criarCena` da T2 + HLR vetorial em SVG + **uma única timeline GSAP determinística** (`DURACAO_SPLASH_S = 3.1`). W (`0,30–0,70 s`) e R (`0,85–1,22 s`) entram com `expo.out` e param seco na pose exata (sem rebote nem escala individual), com troca única `malha-r-solido` → `malha-r-corpo` + `malha-r-quina` em `1,22 s` e impacto sentido por tremor rígido da cena inteira (peças + linhas juntas, `70 ms ≤ 80 ms`, `≤ 1,89 px`) + pulso sutil nas linhas. Expõe `obterPosePecas()`. |
| `src/scripts/splash/controlador.ts` | Passa `{ svgLinhas, container: overlayEl }` para `criarAnimacao`, exibe `<svg data-splash-linhas>` ao ativar o 3D (e esconde no fallback), repassa `alvoEl` para `iniciarModoDebug` e evita fade duplicado quando `pular()` interrompe `tocar()`. No modo normal, `logoEl` nunca fica visível; só é exibida no fallback (`logoEl.style.visibility = 'visible'`) ou no movimento reduzido (`html.splash-reduzida` via CSS). Todas as garantias da T3 preservadas (`sessionStorage`, skip por clique/toque/Esc/Enter/Espaço, movimento reduzido, timeout 800 ms, rede 3 s, teto 8 s, `?splash=travado`, fade do fundo após `tocar()` reservado para T5). |
| `src/scripts/splash/cena/cubo.ts` | Expõe `luz: LuzCena` em `CenaCubo` (aditivo, retrocompatível com T2) para o rastreamento do frustum de sombra durante a animação. |
| `src/scripts/splash/cena/pecas.ts` | Mantém intactas todas as malhas da pose final da T2 (`malha-w`, `malha-r-corpo`, `malha-r-quina`, `malha-r-topo-continuo`, `malha-fundo-esquerda`, `malha-fundo-direita`) e adiciona `malha-r-solido` (`geomRSolido` + `geomRSolidoHlr`, `Z ∈ [-0,5, +0,5]` íntegro, `visible = false` por padrão) para uso exclusivo enquanto o R está em voo ou rebote separado do W. |
| `src/scripts/splash/cena/linhas/{tipos,arestas,construcao,visibilidade,encadear,svg,index}.ts` | Extensão retrocompatível do HLR com `definirEstadoAnimacao(EstadoAnimacaoHlr)`: (1) crescimento das linhas de construção a partir dos 6 asteriscos (`gerarArestasConstrucao(progresso, progressoPonteW)`), separando a haste externa `T_left -X` da ponte interna sobre o vão do W (`ehPonteW`), (2) pulso radial no impacto (`pulsoConstrucao`), (3) matriz mundo das linhas de construção (`matrizConstrucao`) acompanhando o cubo no voo ao header, (4) descarte automático de malhas ocultas (`objetoVisivelNaCena`) antes de cada peça entrar e na alternância de `malha-r-solido`, (5) oclusão 2D incondicional das linhas de construção por qualquer face sólida (`PAPEL_OCLUSAO_CONSTRUCAO` pré-classificado em `arestas.ts`), mantendo teste de profundidade 3D apenas para `ehPonteW` sobre `PAREDE_INTERNA_QUARTO` e sobre `CHANFRO_INTERNO_W` quando o W está encaixado (`wPonteAlinhada`), (6) escalonamento proporcional das espessuras de traço (`svg.ts`) e tolerâncias 2D/3D (`visibilidade.ts`, `encadear.ts`) por `escalaCubo`, e (7) `updateWorldMatrix(true, true)` + cache de visibilidade/estado em `linhas/index.ts`. Com valores padrão (= pose estática T2), o resultado é **bit-a-bit idêntico à T2**. |
| `src/scripts/splash/cena/debug.ts` | Adicionados `/?debug=t4&t=<segundos>` (captura determinística via `seek(t)`, marca `document.documentElement.dataset.capturaPronta = '1'`, sem HUD) e `/?debug=t4` (loop interativo com HUD de tempo/rAF/render/HLR e `window.__wrT4Bench`). Modos da T2 (`/?debug`, `/?debug=captura`, `/?debug=hlr`) preservados intactos. |
| `tools/gauntlet/t4-rodada.mjs` | Gate completo da T4 (check, build, preview isolado na porta 4403 sempre encerrado no `finally`, capturas desktop/movimento/mobile/pose-final, `folha-contato.png`, pixelmatch vs T2 rodada 7, benchmark desktop e mobile, testes de fluxo real em `/` incluindo sondas rAF da logo provisória nos modos normal/fallback/reduzido, regressão T2 `/?debug`/`/?debug=hlr`/`/?debug=captura`, determinismo/resize e estabilidade pós-impacto de W `0,70–0,85 s` e R `1,22–1,60 s` a cada `10 ms`). |

## 2. Como rodar o gate e os modos de inspeção

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Rodar o gate completo da rodada <n>
node tools/gauntlet/t4-rodada.mjs <n>
```

Saídas em `docs/gauntlet/t4/rodada-<n>/`:
- Desktop `1280×800` dpr 1 (quadros-chave): `t-0.30s-desktop.png`, `t-0.70s-desktop.png`, `t-1.25s-desktop.png`, `t-1.90s-desktop.png`, `t-2.60s-desktop.png`, `t-3.10s-desktop.png`
- Desktop `1280×800` dpr 1 (peças em movimento): `t-0.55s-desktop.png`, `t-1.05s-desktop.png`, `t-0.66s-desktop.png`, `t-1.15s-desktop.png`, `t-1.21s-desktop.png`, `t-1.30s-desktop.png`
- Mobile `390×844` dpr 3: `t-1.90s-mobile.png`, `t-2.60s-mobile.png`
- Pose final `1024×1024` dpr 1 (`t = 2.4 s` vs `docs/gauntlet/t2/rodada-7/captura.png`): `pose-final-1024.png`, `pose-final-diff.png`
- Comparativo lado a lado com T0 + linhas de movimento + linha mobile: `folha-contato.png`
- Métricas estruturadas: `metricas.json`

URLs de depuração (com `astro preview` ou `astro dev`):
- `/?debug=t4` — toca em loop com HUD de tempo, ms por quadro (rAF e Render+HLR) e scrub.
- `/?debug=t4&t=1.9` — pausa exatamente em `t = 1,9 s` sem HUD e marca `dataset.capturaPronta = '1'`.
- `/?debug`, `/?debug=captura`, `/?debug=hlr` — modos da T2 preservados.

## 3. Decisões técnicas importantes

1. **Hierarquia 3D sem alterar geometria da pose final nem shaders (`animacao.ts`)**:
   - `raizCubo` (translação/escala do voo até `alvo().rect`) → `pivoShake` (tremor 2–3 px em espaço de tela) → `pivoSquash` (`position.y = -0.5`, achatamento ancorado na base) → `suportePecas` (`position.y = +0.5`) → `{pecas.quarto, pecas.w, pecas.r}`.
   - Em repouso (`2,15–2,60 s`), todas as matrizes se cancelam, `malha-r-solido` fica oculta e `matrixWorld` de cada malha é idêntica à T2 (`0,0000%` diff em `1024×1024` a `t = 2,4 s`).
2. **Timeline puramente normalizada e determinística**:
   - A timeline GSAP anima apenas escalares normalizados (`progressoConstrucao`, `wPosT/wOvT/wReboteT`, `rPosT/rOvT/rReboteT`, `qPosT`, `sqX/Y/Z`, `shakeX/Y`, `pulsoLinhas`, `vooT`), nunca posições de layout gravadas em tweens.
   - Consequência: redimensionar a janela em qualquer instante (inclusive no meio do voo) apenas recalcula `layout` via `ResizeObserver`/`resize` sem matar nem reconstruir a timeline — zero pulo, e o voo mira o `alvo().rect` vivo com erro `0,00 px`.
3. **Coreografia (3,10 s totais)**:
   - `0,00–0,30 s`: 6 asteriscos + 6 arestas da silhueta crescem simetricamente a partir dos vértices (`power2.out`). A ponte interna sobre o vão superior do W (`ARESTAS_CONSTRUCAO` `ehPonteW`) ainda acompanha `wPosT` (pendência nº 2 da crítica R2).
   - `0,30–0,70 s`: W entra do canto inferior esquerdo em diagonal com desaceleração forte (`expo.out`) e para seco na pose final em `0,70 s`, sem overshoot, sem rebote e sem escala individual. Impacto sentido por tremor rígido da cena inteira (`shakeCenaX/Y`, `70 ms ≤ 80 ms`, `≤ 1,89 px`, peças + linhas juntas) e pulso sutil das linhas (`1.018`).
   - `0,85–1,22 s`: R entra do canto inferior direito como sólido íntegro (`malha-r-solido`, `expo.out`) e para seco encaixado no W em `1,22 s`, trocando **uma única vez** para `malha-r-corpo` + `malha-r-quina` (`rPosT < 1 - 1e-6`), sem jamais desencaixar ou voltar para `malha-r-solido`. Impacto sentido pelo mesmo tremor rígido da cena inteira (W+R+linhas juntos por `70 ms`) e pulso sutil das linhas (`1.018`).
   - `1,60–1,90 s`: Quarto branco cai reto de cima (`1,60–1,865 s` `power4.in`); no impacto (`1,865–1,90 s`), achatamento de 7% (`y: 0.93`, `x/z: 1.03`), tremor amortecido `(2.5, -3.0)` px e pulso radial das linhas (`1.032`) atingem pico em `1,90 s`, com retorno elástico até `2,15 s`.
   - `2,15–2,60 s`: Pausa completa na pose T2.
   - `2,60–3,10 s`: Encolhimento reto (`power3.inOut`) até `alvo().rect`, onde a logo completa (cubo + asteriscos) ocupa exatamente `40×40 px` (`36,24 × 40,00 px`, centro `dx = 0,00 px, dy = 0,00 px`).
4. **Sombra dura em dois tons durante toda a animação**:
   - Enquanto peças entram de fora da tela, o frustum e a distância da `DirectionalLight` expandem dinamicamente para cobrir a queda do quarto e evitar recorte.
   - Com o cubo montado (inclusive durante todo o voo/encolhimento), o alvo e a câmera de sombra acompanham `raizCubo.position` e escalam frustum/near/far/`normalBias` por `escalaCubo`, preservando a direção fixa `DIRECAO_LUZ_RAW` e a mesma projeção de sombra sem recorte nem peter-panning até `40×40 px`.
5. **Dimensionamento 1:1 com `scrollbar-gutter: stable` e `dpr` até 3**:
   - `animacao.ts` dimensiona canvas e SVG exclusivamente por `container.clientWidth`/`container.clientHeight` (`1265×800` em viewport `1280×800` desktop Windows, `375×844` em `390×844` Playwright), com `pixelRatio` até `3`.
   - Apenas em `/?debug=t4&t=<seg>` quando a viewport é exatamente `1024×1024`, `debug.ts` força a caixa do overlay para `1024×1024` `dpr 1` (igual ao `/?debug=captura` da T2), permitindo comparação pixel-a-pixel contra `t2/rodada-7/captura.png`.
6. **Pular (`pular()`)**:
   - Interrompe a timeline, garante todas as peças visíveis e interpola suavemente do estado atual até a pose final no header em `~300 ms` (`power3.inOut`; se já estiver em voo, proporcional ao restante).
7. **Oclusão 2D das linhas de construção sobre faces sólidas (Rodada 2)**:
   - Todas as arestas externas/silhueta de construção (`!ehPonteW`) sofrem oclusão 2D incondicional por qualquer triângulo frontal não mascarado (independentemente da profundidade Z), impedindo que arestas fixas ou asteriscos (`±0,723`) risquem peças em movimento, overshoot ou achatamento.
   - A ponte interna sobre o vão superior do W (`ehPonteW`, `X: -0,5 → +0,5, Y = +0,5, Z = +0,5`) também é ocluída em 2D por todas as faces sólidas (R inteiro, face preta/topos do W, topos brancos do quarto), mas mantém teste de profundidade 3D sobre `PAREDE_INTERNA_QUARTO` e sobre `CHANFRO_INTERNO_W` somente quando `wPonteAlinhada` confirma que a quina superior frontal do W coincide com a ponte (`tol = 0,004 × escalaCubo`).
8. **Parada seca sem rebote e troca única da malha do R (Rodadas 3–4)**:
   - `malha-r-solido` (`Z ∈ [-0,5, +0,5]` íntegro) fica ativa exclusivamente enquanto `rPosT < 1 - 1e-6` (em voo, `0,85–1,21 s`); em `1,22 s` (`rPosT = 1`) troca **uma única vez** para `malha-r-corpo` + `malha-r-quina` e nunca mais volta, garantindo `0,0000%` de diff na pose final e na T2.
   - Regra do dono: depois que W (`0,70 s`) ou R (`1,22 s`) encosta na pose final, a peça **não sai mais dali nem por 1 quadro** (sem overshoot, sem rebote e sem escala individual). A sensação de impacto vem de tremor rígido curto da cena inteira (`shakeCenaX/Y`, `70 ms ≤ 80 ms`, `≤ 1,89 px`, aplicando `pivoShake.matrixWorld` em `matrizConstrucao` para mover peças + linhas juntas com erro relativo `0,00 px`) + pulso sutil nas linhas (`1.018`).
9. **Logo SVG provisória oculta no modo normal (Rodada 4)**:
   - `#wr-splash [data-splash-logo]` começa `visibility: hidden` via `src/styles/global.css` desde o primeiro quadro pintado antes de qualquer JS de módulo; só fica visível em `html.splash-reduzida` (CSS) ou no fallback (`logoEl.style.visibility = 'visible'` em `controlador.ts`).

## 4. Armadilhas conhecidas

- **Nunca recolocar rebote ou escala individual em W ou R após o contato**: regra explícita do dono — após encostar na pose final (`0,70 s` para W, `1,22 s` para R), nenhuma peça pode recuar, encolher ou reabrir fresta. O impacto deve usar apenas efeitos rígidos da cena inteira (tremor `≤ 80 ms` aplicando `pivoShake.matrixWorld` nas linhas + pulso de linhas).
- **Não remover a ocultação CSS inicial de `[data-splash-logo]`**: manter `#wr-splash [data-splash-logo] { visibility: hidden; }` + `html.splash-reduzida #wr-splash [data-splash-logo] { visibility: visible; }` em `global.css` (e não `display: none`, pois `calcularDeltaFlip()` no fallback precisa das dimensões de layout `offsetWidth/offsetHeight`).
- **Tolerâncias do HLR em escala pequena (`40×40 px`)**: sem escalar `PASSO_EMENDA_MUNDO`, `TOL_SNAP_VERTICE_PX` e `TOL_DIST_COLINEAR_PX` por `escalaCubo`, os vértices das curvas do R e da janela colapsam durante o pouso no header. Mantenha `escalaCubo` propagado em `visibilidade.ts`, `encadear.ts` e `svg.ts`.
- **Memória curta na máquina**: `t4-rodada.mjs` verifica se a porta `4403` está livre, sobe `astro preview` e **sempre** mata a árvore de processos (`taskkill /T /F` no Windows) no `finally`. Nunca deixe múltiplos servidores ativos nem mate o `astro dev` do dono na porta `4405`.
- **Não antecipar o fade do fundo durante o voo**: o fade de `[data-splash-fundo]` continua após `tocar()` / `pular()` resolver em `controlador.ts` (escopo explícito da T5).

## 5. Tabela de rodadas

| Rodada | Commit | Resumo | Check / Build / Console | Pose final (`t=2.4` vs T2 R7) | Desktop `1280×800` (rAF / Trab / HLR) | Mobile `390×844 dpr 3` (rAF / Trab / HLR) | Fluxo real | Nota crítico |
|---|---|---|---|---|---|---|---|---|
| 1 | `603190e` | Animação 3D determinística completa + HLR animado + `/?debug=t4` + `t4-rodada.mjs` + refinamento do hexágono `0,30 s` e overshoot do R `1,25 s` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,43` (`p95 14,9`) / `1,68` (`p95 4,3`) / **`1,11 ms`** (`p95 3,7`) | `13,29` (`p95 14,0`) / `1,49` (`p95 3,5`) / **`0,94 ms`** (`p95 2,8`) | 7/7 OK | `FAIL · 6,5` |
| 2 | `1848214` | Correção da falha nº 1 (R1): oclusão 2D das linhas de construção por faces sólidas (`PAPEL_OCLUSAO_CONSTRUCAO` + `ehPonteW` + `wPonteAlinhada`), capturas em movimento (`0,55/1,05/0,66/1,21 s`) e comparativo 3× `linhas-antes-depois.png` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,47` (`p95 14,5`) / `1,52` (`p95 3,9`) / **`0,98 ms`** (`p95 3,2`) | `13,28` (`p95 14,5`) / `1,60` (`p95 4,0`) / **`1,01 ms`** (`p95 3,1`) | 7/7 OK | `FAIL · 6,8` |
| 3 | `f3fb93c` | Correção da falha nº 1 (R2): malha sólida `malha-r-solido` durante voo/rebote do R + rebote diagonal contido (`0,0185 u ≈ 4,9 px`) ao longo da trajetória sem erguer pés nem expor W, capturas extras `1,15 s` e `1,30 s` e comparativo 3× `r-antes-depois.png` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,43` (`p95 14,2`) / `1,57` (`p95 3,8`) / **`1,03 ms`** (`p95 3,1`) | `13,27` (`p95 14,1`) / `1,47` (`p95 3,6`) / **`0,96 ms`** (`p95 2,9`) | 7/7 OK | `FAIL · 7,4` |
| 4 | `29afd62` + `358d753` | Pedidos do dono: (1) ocultar `[data-splash-logo]` via CSS no modo normal mantendo fallback e `splash-reduzida` + sondas rAF; (2) parada seca `expo.out` sem rebote/escala em W (`0,30–0,70 s`) e R (`0,85–1,22 s`), troca única de malha do R, tremor rígido da cena inteira (peças+linhas, `70 ms`) + pulso nas linhas, teste pós-impacto a cada `10 ms` e comparativo 3× `impacto-antes-depois.png` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,47` (`p95 14,7`) / `1,82` (`p95 4,5`) / **`1,20 ms`** (`p95 3,6`) | `13,31` (`p95 14,6`) / `1,86` (`p95 4,4`) / **`1,19 ms`** (`p95 3,6`) | 8/8 OK | *(pendente)* |

## 6. Passagem de bastão para o próximo construtor

- **Pedidos do dono resolvidos na rodada 4**:
  - **Logo provisória oculta no modo normal**: `[data-splash-logo]` inicia `visibility: hidden` via CSS (`src/styles/global.css`), comprovado por sonda rAF em `/` (`0/254` quadros visíveis, `5` quadros amostrados antes do 3D iniciar), mantendo funcionamento completo no fallback (`?splash=falha`, `38/40` quadros visíveis voando `595,66 px` até o header) e no movimento reduzido (`reducedMotion: 'reduce'`, `71/71` quadros visíveis desde o início, `0 px` de deslocamento e fade completo).
  - **Parada seca de W e R sem desencaixe pós-impacto**: W (`0,30–0,70 s`) e R (`0,85–1,22 s`) agora entram com `expo.out` (também já visíveis em `0,55 s` e `1,05 s`, endereçando a falha nº 1 da crítica R3) e param seco na pose final sem overshoot, rebote ou escala individual; troca única `malha-r-solido` → `malha-r-corpo` + `malha-r-quina` em `1,22 s`, tremor rígido da cena inteira (`70 ms ≤ 80 ms`, `1,89 px` com linhas acompanhando `pivoShake.matrixWorld`) e `0,0000 px` de desvio pós-impacto em todas as `16` amostras de W (`0,70–0,85 s`) e `39` amostras de R (`1,22–1,60 s`).
- **Pendências remanescentes da crítica da rodada 3 (`docs/gauntlet/t4/rodada-3/critica.md`)**:
  - **Falha nº 2 (ponte interna de construção `ehPonteW` crescendo após `0,30 s`)**: hoje `progressoPonteW` ainda acompanha `estado.wPosT`, fazendo a diagonal superior-esquerda aparecer atrasada em `0,55 s` / `0,66 s`. Vincular `progressoPonteW` a `estado.progressoConstrucao` em `src/scripts/splash/animacao.ts` para completar todo o traçado até `0,30 s`.
  - **Falha nº 3 (pouso no header em `3,10 s`)**: pontos cinza subpixel dos asteriscos e contorno interno serrilhado em `40×40 px` (fazer fade-out das linhas de construção na segunda metade do voo `2,60–2,95 s` + piso de espessura legível de contorno / cross-fade curto em `2,95–3,10 s`). Lembrando que o fade do fundo `[data-splash-fundo]` continua reservado para a T5.
