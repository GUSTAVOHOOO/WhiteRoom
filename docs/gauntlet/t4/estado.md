# T4 — Estado do Gauntlet Loop (Passagem de Bastão → Rodada 3)

Branch: `GUSTAVOHOOO/splash-t4-animacao` · Base: `aa97cc5 docs: capturas de referencia do prototipo T0`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz.
Perfis SVG (`src/assets/logo/perfis/*.svg`), geometria/cores das faces (`pecas.ts`, `materiais.ts`, `constantes.ts`), `DIRECAO_LUZ_RAW` (`luz.ts`) e estilo das linhas (`#171717` `5,5 px` e `#A8A8A4` `1,15 px` em 1024) estão **intactos**.

## 1. Arquitetura da T4

| Arquivo | Papel na T4 |
|---|---|
| `src/scripts/splash/contrato.ts` | Estendido minimamente com `OpcoesAnimacaoSplash` opcional (`svgLinhas`, `container`, `dpr`) no 3º parâmetro de `CriarAnimacao`. |
| `src/scripts/splash/animacao.ts` | Substituiu o stub 2D pela animação 3D real (`criarAnimacao` e `criarAnimacaoControlavel`) usando `criarCena` da T2 + HLR vetorial em SVG + **uma única timeline GSAP determinística** (`DURACAO_SPLASH_S = 3.1`). |
| `src/scripts/splash/controlador.ts` | Passa `{ svgLinhas, container: overlayEl }` para `criarAnimacao`, exibe `<svg data-splash-linhas>` ao ativar o 3D (e esconde no fallback), repassa `alvoEl` para `iniciarModoDebug` e evita fade duplicado quando `pular()` interrompe `tocar()`. Todas as garantias da T3 preservadas (`sessionStorage`, skip por clique/toque/Esc/Enter/Espaço, movimento reduzido, timeout 800 ms, rede 3 s, teto 8 s, `?splash=travado`, fade do fundo após `tocar()` reservado para T5). |
| `src/scripts/splash/cena/cubo.ts` | Expõe `luz: LuzCena` em `CenaCubo` (aditivo, retrocompatível com T2) para o rastreamento do frustum de sombra durante a animação. |
| `src/scripts/splash/cena/linhas/{tipos,arestas,construcao,visibilidade,encadear,svg,index}.ts` | Extensão retrocompatível do HLR com `definirEstadoAnimacao(EstadoAnimacaoHlr)`: (1) crescimento das linhas de construção a partir dos 6 asteriscos (`gerarArestasConstrucao(progresso, progressoPonteW)`), separando a haste externa `T_left -X` da ponte interna sobre o vão do W (`ehPonteW`), (2) pulso radial no impacto (`pulsoConstrucao`), (3) matriz mundo das linhas de construção (`matrizConstrucao`) acompanhando o cubo no voo ao header, (4) descarte automático de malhas ocultas (`objetoVisivelNaCena`) antes de cada peça entrar, (5) oclusão 2D incondicional das linhas de construção por qualquer face sólida (`PAPEL_OCLUSAO_CONSTRUCAO` pré-classificado em `arestas.ts`), mantendo teste de profundidade 3D apenas para `ehPonteW` sobre `PAREDE_INTERNA_QUARTO` e sobre `CHANFRO_INTERNO_W` quando o W está encaixado (`wPonteAlinhada`), (6) escalonamento proporcional das espessuras de traço (`svg.ts`) e tolerâncias 2D/3D (`visibilidade.ts`, `encadear.ts`) por `escalaCubo`, e (7) `updateWorldMatrix(true, true)` + cache de visibilidade/estado em `linhas/index.ts`. Com valores padrão (= pose estática T2), o resultado é **bit-a-bit idêntico à T2**. |
| `src/scripts/splash/cena/debug.ts` | Adicionados `/?debug=t4&t=<segundos>` (captura determinística via `seek(t)`, marca `document.documentElement.dataset.capturaPronta = '1'`, sem HUD) e `/?debug=t4` (loop interativo com HUD de tempo/rAF/render/HLR e `window.__wrT4Bench`). Modos da T2 (`/?debug`, `/?debug=captura`, `/?debug=hlr`) preservados intactos. |
| `tools/gauntlet/t4-rodada.mjs` | Gate completo da T4 (check, build, preview isolado na porta 4403 sempre encerrado no `finally`, capturas desktop/movimento/mobile/pose-final, `folha-contato.png`, pixelmatch vs T2 rodada 7, benchmark desktop e mobile, testes de fluxo real em `/` sem debug + regressão T2 + determinismo/resize). |

## 2. Como rodar o gate e os modos de inspeção

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Rodar o gate completo da rodada <n>
node tools/gauntlet/t4-rodada.mjs <n>
```

Saídas em `docs/gauntlet/t4/rodada-<n>/`:
- Desktop `1280×800` dpr 1 (quadros-chave): `t-0.30s-desktop.png`, `t-0.70s-desktop.png`, `t-1.25s-desktop.png`, `t-1.90s-desktop.png`, `t-2.60s-desktop.png`, `t-3.10s-desktop.png`
- Desktop `1280×800` dpr 1 (peças em movimento): `t-0.55s-desktop.png`, `t-1.05s-desktop.png`, `t-0.66s-desktop.png`, `t-1.21s-desktop.png`
- Mobile `390×844` dpr 3: `t-1.90s-mobile.png`, `t-2.60s-mobile.png`
- Pose final `1024×1024` dpr 1 (`t = 2.4 s` vs `docs/gauntlet/t2/rodada-7/captura.png`): `pose-final-1024.png`, `pose-final-diff.png`
- Comparativo lado a lado com T0 + linhas de movimento + linha mobile: `folha-contato.png`
- Métricas estruturadas: `metricas.json`

URLs de depuração (com `astro preview` ou `astro dev`):
- `/?debug=t4` — toca em loop com HUD de tempo, ms por quadro (rAF e Render+HLR) e scrub.
- `/?debug=t4&t=1.9` — pausa exatamente em `t = 1,9 s` sem HUD e marca `dataset.capturaPronta = '1'`.
- `/?debug`, `/?debug=captura`, `/?debug=hlr` — modos da T2 preservados.

## 3. Decisões técnicas importantes

1. **Hierarquia 3D sem alterar geometria nem shaders (`animacao.ts`)**:
   - `raizCubo` (translação/escala do voo até `alvo().rect`) → `pivoShake` (tremor 2–3 px em espaço de tela) → `pivoSquash` (`position.y = -0.5`, achatamento ancorado na base) → `suportePecas` (`position.y = +0.5`) → `{pecas.quarto, pecas.w, pecas.r}`.
   - Em repouso (`2,15–2,60 s`), todas as matrizes se cancelam e `matrixWorld` de cada malha é idêntica à T2 (`0,0000%` diff em `1024×1024` a `t = 2,4 s`).
2. **Timeline puramente normalizada e determinística**:
   - A timeline GSAP anima apenas escalares normalizados (`progressoConstrucao`, `wPosT/wOvT/wReboteT`, `rPosT/rOvT/rReboteT`, `qPosT`, `sqX/Y/Z`, `shakeX/Y`, `pulsoLinhas`, `vooT`), nunca posições de layout gravadas em tweens.
   - Consequência: redimensionar a janela em qualquer instante (inclusive no meio do voo) apenas recalcula `layout` via `ResizeObserver`/`resize` sem matar nem reconstruir a timeline — zero pulo, e o voo mira o `alvo().rect` vivo com erro `0,00 px`.
3. **Coreografia (3,10 s totais)**:
   - `0,00–0,30 s`: 6 asteriscos + 6 arestas da silhueta crescem simetricamente a partir dos vértices (`power2.out`). A ponte interna sobre o vão superior do W (`ARESTAS_CONSTRUCAO[8]` trecho `+X`) acompanha `wPosT`, mantendo o hexágono de `0,30 s` limpo e simétrico como no T0.
   - `0,30–0,70 s`: W entra do canto inferior esquerdo em diagonal (`0,30–0,67 s` `power4.in`), atinge overshoot e squash ~6% no pico em `0,70 s` e faz rebote mecânico (`0,70–0,85 s`, `back.out(2.8)`).
   - `0,85–1,25 s`: R entra do canto inferior direito (`0,85–1,22 s` `power4.in`), trava na quina em `1,25 s` com overshoot `(0.008, 0.028, 0)` + squash `(1.03, 0.95, 1.0)` (mantendo `meshRLamina` em `X >= +0.5` para não expor a face cinza do W) e rebote (`1,25–1,41 s`).
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
   - A ponte interna sobre o vão superior do W (`ehPonteW`, `X: -0,5 → +0,5, Y = +0,5, Z = +0,5`) também é ocluída em 2D por todas as faces sólidas (R inteiro, face preta/topos do W, topos brancos do quarto), mas mantém teste de profundidade 3D sobre `PAREDE_INTERNA_QUARTO` (faces verticais internas do quarto) e sobre `CHANFRO_INTERNO_W` (face lateral interna da haste esquerda do W) somente quando `wPonteAlinhada` confirma que a quina superior frontal do W coincide com a ponte (`tol = 0,004 × escalaCubo`).
   - Preserva `0,0000%` de diff (`0 / 1.048.576 px`) na pose final em `t = 2,4 s` e no modo estático da T2.

## 4. Armadilhas conhecidas

- **Não alterar `rOvershoot.x` para negativo nem `rSz < 1`**: como `meshRLamina` é uma lâmina fina em `X = +0.5, Z ∈ [0.365, 0.5]` sobre a coluna do W (`X <= 0.4992`), deslocar R para `X < +0.5` ou encolher R em `Z` expõe a face cinza da coluna do W e faz a lâmina atravessar o topo branco do W.
- **Tolerâncias do HLR em escala pequena (`40×40 px`)**: sem escalar `PASSO_EMENDA_MUNDO`, `TOL_SNAP_VERTICE_PX` e `TOL_DIST_COLINEAR_PX` por `escalaCubo`, os vértices das curvas do R e da janela colapsam durante o pouso no header. Mantenha `escalaCubo` propagado em `visibilidade.ts`, `encadear.ts` e `svg.ts`.
- **Memória curta na máquina**: `t4-rodada.mjs` verifica se a porta `4403` está livre, sobe `astro preview` e **sempre** mata a árvore de processos (`taskkill /T /F` no Windows) no `finally`. Nunca deixe múltiplos servidores ativos.
- **Não antecipar o fade do fundo durante o voo**: o fade de `[data-splash-fundo]` continua após `tocar()` / `pular()` resolver em `controlador.ts` (escopo explícito da T5).

## 5. Tabela de rodadas

| Rodada | Commit | Resumo | Check / Build / Console | Pose final (`t=2.4` vs T2 R7) | Desktop `1280×800` (rAF / Trab / HLR) | Mobile `390×844 dpr 3` (rAF / Trab / HLR) | Fluxo real | Nota crítico |
|---|---|---|---|---|---|---|---|---|
| 1 | `603190e` | Animação 3D determinística completa + HLR animado + `/?debug=t4` + `t4-rodada.mjs` + refinamento do hexágono `0,30 s` e overshoot do R `1,25 s` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,43` (`p95 14,9`) / `1,68` (`p95 4,3`) / **`1,11 ms`** (`p95 3,7`) | `13,29` (`p95 14,0`) / `1,49` (`p95 3,5`) / **`0,94 ms`** (`p95 2,8`) | 7/7 OK | `FAIL · 6,5` |
| 2 | `1848214` | Correção da falha nº 1: oclusão 2D das linhas de construção por faces sólidas (`PAPEL_OCLUSAO_CONSTRUCAO` + `ehPonteW` + `wPonteAlinhada`), capturas em movimento (`0,55/1,05/0,66/1,21 s`) e comparativo 3× `linhas-antes-depois.png` | OK / OK / 0 err, 0 warn | **`0,0000%`** (`0 / 1.048.576 px`) | `13,47` (`p95 14,5`) / `1,52` (`p95 3,9`) / **`0,98 ms`** (`p95 3,2`) | `13,28` (`p95 14,5`) / `1,60` (`p95 4,0`) / **`1,01 ms`** (`p95 3,1`) | 7/7 OK | *(pendente)* |

## 6. Passagem de bastão para o próximo construtor

- **Falha nº 1 (resolvida na rodada 2)**: nenhuma linha de construção atravessa face sólida em movimento (`0,55 s`, `0,66 s`, `1,05 s`, `1,21 s`), impactos (`0,70 s`, `1,25 s`, `1,90 s` desktop e mobile) ou queda do quarto, preservando `0,0000%` de diff na pose final (`t = 2,4 s`).
- **Pendências remanescentes da crítica da rodada 1 (`docs/gauntlet/t4/rodada-1/critica.md`)**:
  - **Falha nº 2 (pouso no header em `3,10 s`)**: contorno serrilhado/quebrado em `40×40 px` e 6 resquícios subpixel cinza dos asteriscos ao redor. Caminhos sugeridos pelo crítico: fade-out das linhas de construção na segunda metade do voo (`2,60–2,95 s`) e largura mínima legível de contorno (~0,9–1,1 px) em `svg.ts` / `animacao.ts` (lembrando que o fade do fundo `[data-splash-fundo]` continua reservado para a T5).
  - **Falha nº 3 (encaixe de W e R nos quadros de impacto `0,70 s` e `1,25 s`)**: W em `0,70 s` deslocado ~14 px para cima/direita pelo `wOvershoot` + rebote até `0,85 s`; R em `1,25 s` erguido em `+Y` pelo `rOvershoot` expondo rebarba cinza do W na base e degrau na quina. Atenção à armadilha conhecida: não deixar `meshRLamina` cruzar para `X < +0,5` nem `rSz < 1`.
- **Observação útil**: `progressoPonteW` em `animacao.ts` hoje acompanha `estado.wPosT`, fazendo a ponte interna crescer a partir de `T_left` antes de o W chegar ao cubo (visível em `t-0.55s-desktop.png` e `t-0.66s-desktop.png`). Não afeta a falha nº 1 nem cruza faces sólidas, mas vale revisar quando mexer em `animacao.ts` na falha nº 3.
