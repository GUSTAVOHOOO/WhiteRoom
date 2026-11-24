# F0 — Diagnóstico das Linhas (Baseline Rodada 5)

Data: 2026-11-23. Medições executadas sobre o estado exato da rodada 5 (`72702d7`, captura em `1024×1024`, `dpr = 1`, porta `4403`), revertendo todos os experimentos logo após a coleta.

Evidências visuais (zoom 4× nearest-neighbor):
- `docs/gauntlet/t2/linhas/f0-bias0-quinas.png` — colunas: **Baseline (bias 0,0012)** | **Bias 0** | **Referência JPG** (linhas: canto sup. esq. do furo do R, base da haste do R, topo direito da porta, quina côncava `In_back`).
- `docs/gauntlet/t2/linhas/f0-magenta-aro.png` — colunas: **Baseline** | **`uCorInterna = #ff00ff` (sem contornos)** | **`uCorInterna = #ff00ff` + `uCorSombra = #00ff00` (sem contornos)** (linhas: emenda W/FE, emenda FE/FD, emenda R/FD).

---

## 1. Experimento 1 — Bias `0` em `LineMaterial` (`0.0012 → 0`)

Objetivo: verificar se as espículas/dentes pretos nas quinas vêm do vazamento de arestas ocultas causado pelo bias em `clip.z`, e se zerar o bias degrada as quinas côncavas (`In_back`).

| Região (`60×60` / `65×65` px em `1024²`) | Pixels escuros (`RGB < 80`) — Baseline (`0.0012`) | Bias `0` | Delta | Referência JPG | Observação visual (`f0-bias0-quinas.png`) |
|---|---:|---:|---:|---:|---|
| Canto sup. esq. do furo do R (`520..580, 480..540`) | 345 | 283 | −62 | 320 | Bloco preto `~4×4 px` sobre o ocre reduz para toco residual `~1,5 px` (sobra por `polygonOffset(1,1)` + ponta redonda do `LineMaterial` no vértice frontal). |
| Base da haste do R (`515..575, 715..780`) | 476 | 339 | −137 | 432 | Dente preto mordendo a borda inferior ocre **some completamente**; calombo arredondado da ponta reduz. |
| Topo direito da porta (`405..470, 375..440`; vértice `432..446, 390..406`) | 610 (vértice: **57**) | 457 (vértice: **29**) | −153 (−28) | 476 (vértice: **29**) | Prolongamento acima do topo direito da porta **desaparece**, empatando os `29 px` escuros da referência no vértice (sobra só `1 px` da ponta redonda). |
| Quina côncava `In_back` (`482..542, 243..303`) | 697 | 507 | −190 | 690 | Aresta vertical interna perde quase toda a espessura: largura horizontal em `y = 310` cai de **`5 px` → `1 px`** (referência: **`5 px`**). |

**Conclusão F0.1 (CONFIRMADA):** o conflito descrito na pesquisa é real e estrutural. O bias `0.0012` causa os dentes e espículas ao deixar vazar os primeiros `~0,024 u` das arestas ocultas de profundidade; zerar o bias elimina/encolhe drasticamente esses dentes, mas colapsa imediatamente as quinas côncavas (`In_back` cai de `5 px` para `1 px`). Nenhum bias constante em depth buffer resolve os dois casos simultaneamente.

---

## 2. Experimento 2 — Contornos ocultos + `uCorInterna` em magenta (`#ff00ff`)

Objetivo: distinguir **Hipótese A** (fresta de rasterização por T-junction entre topos de peças diferentes deixando vazar a face interna embaixo) de **Hipótese B** (vazamento de contorno oculto via bias). Todos os `LineSegments2` e o `<svg>` de construção foram escondidos; em um segundo passe (`split`), `uCorSombra` foi pintado de verde (`#00ff00`) para separar face interna iluminada vs sombreada.

| Emenda no aro branco superior | Pixels não-brancos isolados dentro do topo branco | Pixels magenta (`uCorInterna`) | Pixels verdes (`uCorSombra`) | Cor na captura baseline |
|---|---:|---:|---:|---|
| W / fundo-esquerda (`Z = +0.365`, `295..345, 340..380`) | 24 | 6 puros (+18 AA rosa `255,191,255`) | 0 | Cinza claro `#FAFAF9` / `#EBEAE6` em linha pontilhada diagonal |
| fundo-esquerda / fundo-direita (`X = -0.365`, `505..555, 240..280`) | 10 | 8 puros (+2 AA rosa) | 0 | Cinza `#BBB`–`#F5F5F2` em linha pontilhada diagonal |
| R / fundo-direita (`Z = -0.365`, `678..728, 355..395`) | 39 | 13 puros (+19 AA rosa) | 7 (na borda externa sob `meshRTopoContinuo`) | Cinza pontilhado atravessando o aro branco |

**Conclusão F0.2 (HIPÓTESE A CONFIRMADA):** os 3 tracinhos cinza pontilhados sobre o aro branco persistem com todos os contornos ocultos e ficam **100% magenta** (`uCorInterna` — face interna iluminada que fica imediatamente abaixo da emenda, misturada por MSAA). Trata-se de **fresta de T-junction** entre os polígonos de topo das peças vizinhas, cujas arestas não compartilham os mesmos vértices:
- `W` (`X ∈ [-0.5, -0.2775]`) × `fundo-esquerda` (`X ∈ [-0.5, -0.365]`) em `Z = +0.365`;
- `fundo-esquerda` (`Z ∈ [-0.5, +0.365]`) × `fundo-direita` (`Z ∈ [-0.5, -0.365]`) em `X = -0.365`;
- `fundo-direita` (`X ∈ [-0.365, +0.4992]`) × `meshRTopoContinuo` (`X ∈ [+0.365, +0.5]`) em `Z = -0.365` (além da borda externa de `meshRTopoContinuo` sobre o corpo curvo do R).

Na F2, além do HLR para linhas, é necessário fechar essas T-junctions nas faces do topo branco (alinhando vértices nas emendas ou unificando o tampo do aro quando encaixado).

---

## 3. Experimento 3 — Contagem de segmentos duplicados em espaço de mundo (pose final)

Contagem extraída diretamente dos buffers `instanceStart`/`instanceEnd` de todos os `LineSegments2` na cena (`matrixWorld` aplicado), agrupando segmentos por reta suporte canônica (direção normalizada + ponto mais próximo da origem, tolerância `1e-3`) e medindo interseção 1D `> 1e-3`:

- **Total de segmentos na cena atual:** **636**
  - `contorno-r`: **557** (87,6% do total, inflado por `curveSegments: 64`)
  - `contorno-w`: **34**
  - `contorno-fundo-esquerda`: **24**
  - `contorno-fundo-direita`: **20**
  - `linha-construcao-frontal-w`: **1**
- **Sobreposições dentro da mesma peça:** **0**
- **Sobreposições entre peças diferentes:** **8 pares** (3 diretamente visíveis na pose final + 5 ocultos, dos quais 2 geram dentes no topo branco por vazamento de bias):

| # | Peça 1 | Peça 2 | Comprimento sobreposto (u) | Segmento 1 (`world`) | Segmento 2 (`world`) | Efeito visual atual |
|---|---|---|---:|---|---|---|
| 1 | `contorno-w` | `contorno-r` | **1,000** | `(0.5, 0.5, 0.5) → (0.5, -0.5, 0.5)` | `(0.5, -0.5, 0.5) → (0.5, 0.5, 0.5)` | **Visível (`T_front → B_front`)**: aresta vertical frontal desenhada em dobro. |
| 2 | `contorno-w` | `contorno-r` | **0,135** | `(0.5, 0.5, 0.365) → (0.5, 0.5, 0.5)` | `(0.5, 0.5, 0.5) → (0.5, 0.5, -0.16)` | **Visível**: borda superior frontal do R sobreposta pelo topo da quina do W (`~37 px`). |
| 3 | `contorno-w` | `contorno-r` | **0,135** | `(0.5, -0.5, 0.5) → (0.27, -0.5, 0.5)` | `(0.365, -0.5, 0.5) → (0.5, -0.5, 0.5)` | **Visível**: base frontal do W sobreposta pela base do R (`~37 px`). |
| 4 | `contorno-fundo-esquerda` | `contorno-w` | **1,000** | `(-0.5, 0.5, 0.365) → (-0.5, -0.5, 0.365)` | `(-0.5, 0.5, 0.365) → (-0.5, -0.5, 0.365)` | Oculta na maior parte, mas ponta superior em `Y = 0.5` vaza via bias → **dente em `(302, 321)`**. |
| 5 | `contorno-fundo-esquerda` | `contorno-fundo-direita` | **1,000** | `(-0.365, 0.5, -0.5) → (-0.365, -0.5, -0.5)` | `(-0.365, 0.5, -0.5) → (-0.365, -0.5, -0.5)` | Oculta na maior parte, mas ponta superior em `Y = 0.5` vaza via bias → **dente em `(545, 240)`**. |
| 6 | `contorno-fundo-esquerda` | `contorno-fundo-direita` | **0,135** | `(-0.365, -0.5, -0.5) → (-0.365, -0.5, -0.105)` | `(-0.365, -0.5, -0.5) → (-0.365, -0.5, -0.365)` | Oculta (base traseira). |
| 7 | `contorno-fundo-direita` | `contorno-r` | **0,135** | `(-0.365, -0.5, -0.5) → (0.5, -0.5, -0.5)` | `(0.365, -0.5, -0.5) → (0.5, -0.5, -0.5)` | Oculta (base traseira direita). |
| 8 | `contorno-fundo-esquerda` | `contorno-w` | **0,135** | `(-0.5, -0.5, 0.365) → (-0.365, -0.5, 0.365)` | `(-0.5, -0.5, 0.365) → (-0.2695, -0.5, 0.365)` | Oculta (base esquerda). |

Além disso, `linha-construcao-frontal-w` (`(-0.2775, 0.5, 0.5) → (0.2815, 0.5, 0.5)`) é um `LineSegments2` isolado com bias próprio (`0.0006`) que cruza o vão do W sem coordenação com os contornos das aberturas, e as 6 arestas prolongadas de `linhas-construcao.ts` sobrepõem-se 100% em 2D à silhueta externa do cubo.

**Conclusão F0.3 (CONFIRMADA):** existem **8 pares de segmentos duplicados/sobrepostos** entre peças na pose final — incluindo a vertical frontal `T_front → B_front` e duas bordas de `0.135 u` no encontro W/R, totalmente visíveis — além de 557 segmentos só no R (exigindo curva mais econômica para o HLR em tempo real). O diagnóstico valida integralmente a arquitetura de HLR vetorial em SVG das fases F1–F4.
