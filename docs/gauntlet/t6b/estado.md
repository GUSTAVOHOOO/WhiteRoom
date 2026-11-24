# T6b — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 1)

Branch: `GUSTAVOHOOO/splash-t6b-entradas` · Base: `f03f48e T6 rodada 1: snap pelo dpr real e pouso em dpr fracionário`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz nem a `tools/gauntlet/package.json`.
Arquivos fora de escopo (`controlador.ts`, `src/pages/index.astro`, `Splash.astro`, `global.css`) permaneceram **100% intocados** para evitar conflito com o trabalho paralelo da barra de carregamento.
Perfis SVG, geometria da pose final, cores, luz, shader de sombra (AA 8×), quarto branco (`1,60–2,15 s`), pausa (`2,15–2,60 s`), voo SVG (`2,60–3,10 s`), logos SVG e favicons estão **intactos** (`gerar-logo-svg --check` 9/9 byte a byte; pose final `t = 2,4 s` `0,0000%` diff contra T6 r1 em todos os 8 viewports).

## 1. Arquitetura das Mudanças da T6b

| Arquivo | Papel na T6b |
|---|---|
| `src/scripts/splash/animacao.ts` | (1) Entrada acelerada `power2.in` (`t³`) para W (`0,35–0,70 s`, `duration: 0,35`) e R (`0,90–1,25 s`, `duration: 0,35`), travando seco na pose final em `0,70 s` e `1,25 s` sem rebote nem achatamento individual (`0,0000 px` de fresta); (2) impacto mais forte na família do quarto — tremor rígido da cena inteira (peças + linhas via `pivoShake.matrixWorld`) de `2,44 px` (`±2,0 / +1,4 px`) em 4 inversões amortecidas (`5 × 25 ms = 125 ms`) na direção de entrada + pulso nas linhas `1,027` (`135 ms`), mantendo o quarto como clímax (`power4.in`, `3,91 px`, `1,032`, squash 7%); (3) razão diagonal `V/H <= 0,84` (`~40°`) em `recalcularLayout()` também no retrato, elevando `rInicio.z` de `-0,25` para `-0,85..-0,985` e eliminando a subida íngreme por baixo do W; (4) `quarto` adicionado a `obterPosePecas()` (aditivo) para telemetria direta de velocidade. |
| `src/scripts/splash/cena/pecas.ts` | `geomRSolido` e `geomRSolidoHlr` recebem recuo `limitarEixoGeometria(..., 'z', 'max', 0.5 - INSET_QUINA)` (`Z <= 0,4992`, espelho do recuo do W em `+X`), eliminando qualquer possibilidade de z-fighting com a face frontal preta do W (`Z = 0,5`) em qualquer instante de aproximação. Sem efeito na pose final nem na T2 (`malha-r-solido` fica oculta quando `rPosT >= 1 - 1e-6`). |
| `src/scripts/splash/cena/linhas/visibilidade.ts` | (1) Separa `escalaMundo = Math.min(1, escalaCubo)` para tolerâncias 3D/NDC (`epsOclusaoNdc`, `passoEmendaMundo`, `epsPlanoEmendaNdc`, `tolAlinhamentoW`) para que o zoom retrato `1,175` não afrouxe testes de profundidade; (2) exclui `malha-r-solido` de `pontoEmFaceCoplanarVizinha()`, impedindo que a face lateral cinza do R em voo apague o contorno preto do W antes do encaixe. |
| `tools/gauntlet/t6b-rodada.mjs` | Gate completo da T6b na porta `4404` (sempre desligado no `finally`, sem tocar nas portas `4403`/`4405`): `astro check`, `astro build`, `gerar-logo-svg --check` (9/9), recortes 4× da perna do R (`0,85–1,35 s` @ `1/120 s` = 61 quadros + estresse sub-quadro `1 ms` em `1,240–1,251 s`) nos 4 viewports, detector automático de z-fighting e fresta pós-contato (`1/120 s`), tiras antes×depois W e R (`390×844` e `1280×800`), gráfico de velocidade (`grafico-velocidade.png/.svg`), comparativo 4× `glitch-perna-r-antes-depois-4x.png`, regressão completa da T6 r1 e dos 11 testes da T5, `folha-contato.png` e `metricas.json`. |

## 2. Como rodar o gate da T6b

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Rodar o gate completo da T6b na porta 4404
node tools/gauntlet/t6b-rodada.mjs 1
```

## 3. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador 9/9 | Pose `t=2,4` vs T6 r1 | Vel. impacto 60 fps (W / R / Q) | Glitch R (120 Hz + 1 ms) | Fresta pós-contato | Pouso 390×844 / Troca | CPU 4× (`pronto` / `p95`) | Regressão T5 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `power2.in` (`t³`, `0,35 s`), tremor rígido `2,44 px`/`125 ms`, pulso `1,027`, diagonal retrato `40°` (`rInicio.z ≤ -0,85`), `INSET_QUINA` em `geomRSolido`, HLR sem emenda falsa em `malha-r-solido` | OK / OK / 0 err, 0 warn | **9/9 OK** | **`0,0000%`** (8/8 VPs) | Desk **`149,4 / 149,4 / 172,2`** · Mob **`69,7 / 69,7 / 147,4`** px/q | **`0` z-fight · `0` falha** | **`0,0000 px`** (`0` bg px) | **`0,0035%`** / **`0,0004%`** | **`412,6 ms`** / **`20,1 ms`** | **11/11 OK** |

## 4. Evidências geradas (`docs/gauntlet/t6b/rodada-1/`)

- Notas detalhadas: `docs/gauntlet/t6b/rodada-1/notas.md`
- Métricas completas: `docs/gauntlet/t6b/rodada-1/metricas.json`
- Folha de contato (6 mobile/tablet × 8 tempos): `docs/gauntlet/t6b/rodada-1/folha-contato.png`
- Gráfico de velocidade (antes × depois, desktop e celular): `docs/gauntlet/t6b/rodada-1/grafico-velocidade.png` e `grafico-velocidade.svg`
- Comparativo 4× do glitch da perna do R (antes × depois): `docs/gauntlet/t6b/rodada-1/glitch-perna-r-antes-depois-4x.png`
- Grades `1/120 s` (61 quadros) da perna do R depois: `docs/gauntlet/t6b/rodada-1/grade-r-depois-{390x844-dpr3,360x740-dpr3,768x1024-dpr2,1280x800-dpr1}.png` e recortes 4× individuais em `docs/gauntlet/t6b/rodada-1/recortes-4x/`
- Tiras antes × depois: `tira-w-antes-depois-390x844.png`, `tira-r-antes-depois-390x844.png`, `tira-w-antes-depois-1280x800.png`, `tira-r-antes-depois-1280x800.png`

## 5. Passagem de bastão

- Todos os critérios da T6b e toda a regressão da T6 r1 + T5 passaram com `0` erros e `0` avisos de console.
- Caso o dono queira ajustar ainda mais o "peso" percebido ao vivo no túnel (ex.: mexer ±`0,03 s` na duração `0,35 s` ou na amplitude do tremor `2,44 px`), basta ajustar o bloco de W/R em `src/scripts/splash/animacao.ts` e reexecutar `node tools/gauntlet/t6b-rodada.mjs <n>`.
- Atenção ao mergear com a worktree paralela da barra de carregamento (`controlador.ts`, `index.astro`, `Splash.astro`, `global.css`): não há nenhum arquivo em comum alterado.
