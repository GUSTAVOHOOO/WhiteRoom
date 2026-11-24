# T5 Rodada 2 — Notas: Favicons Legíveis, Plaquinha Clara e Ícones Android

Esta rodada atua **exclusivamente nos favicons, ícones PWA e manifest**, seguindo integralmente as três decisões do dono sobre a crítica da rodada 1 (`docs/gauntlet/t5/rodada-1/critica.md`). A logo completa (`whiteroom-logo.svg`), a logo do header (`whiteroom-logo-header.svg`), a animação 3D, a troca `3D → SVG`, o voo, o pouso e `pular()` permaneceram **intactos (0 bytes alterados em `src/`)**.

## 1. Decisões aplicadas no gerador (`tools/gauntlet/gerar-logo-svg.mjs`)

1. **Plaquinha clara sempre (`#FAFAF8`) + borda `#E4E3DF` (sem `prefers-color-scheme`)**:
   - Todos os favicons (`public/favicon.svg` e as entradas 16, 32 e 48 px de `public/favicon.ico`) ganharam fundo em quadrado de cantos arredondados com raio **`21%`** do lado (`rx = 6,72` em `32×32`, inset para a borda), cor `#FAFAF8` e fundo transparente fora da placa.
   - **Escolha da borda `#E4E3DF` (decidida pelos prints)**: sobre abas brancas (`#FFFFFF`, padrão claro de Chrome/Edge/Safari) e sobre `#FAFAF8`, o `#FAFAF8` tem contraste quase nulo (`~1,04:1`) e a placa desaparece; um traço finíssimo `#E4E3DF` (`0,9` na grade `32×32` — `0,45 px` em 16 px e `0,9 px` em 32 px; `1 px` em 48 px; `0,4%` do lado em 192/512 px) emoldura a placa com nitidez sobre `#FFFFFF` e `#FAFAF8` sem escurecer nem gerar ruído sobre aba escura `#202124`, mantendo a mesma aparência em qualquer tema sem `prefers-color-scheme`.

2. **Versão simplificada derivada automaticamente do 3D para 16 e 32 px (e `favicon.svg`)**:
   - Gerada de forma 100% reprodutível em `montarFaviconSimplificado()` a partir dos polígonos reais extraídos da renderização `4096×4096` do 3D — **nenhum polígono desenhado à mão**.
   - **Camadas removidas**: `sombra`, `sombra-perna-r`, `batente-porta`, `construcao`, o contorno completo `dContorno` (que trazia arestas de porta, janela, batentes e profundidade interna do furo do R) e o sub-loop mínimo da soleira da porta em `topo`.
   - **Camadas preservadas e simplificadas**:
     - `topo` (loop principal do aro aberto): simplificação RDP (`12 px` em 1024) + remoção automática dos dois micro-degraus de espessura interna (`< 38 px`), preservando os 10 vértices exatos do aro superior isométrico em `#FFFFFF` com traço `#171717` (`1,0`).
     - `interna-simplificada` (`#EBEAE6`): derivada programaticamente costurando a borda interna de `topo` ao recorte superior de `w-externa` entre os dois vértices compartilhados — mantém a cavidade limpa do quarto aberto sem janela traseira nem divisórias finas.
     - `w-externa` (`#171717`): preenchimento puro sem traço extra, evitando engrossar as hastes e mantendo o **vão do W** totalmente aberto.
     - `r-externa` (`#CD9016`, `fill-rule="evenodd"`): preenchimento ocre com o furo vazado sobre `#FAFAF8`, contorno `#171717` (`0,9`) apenas no perímetro externo do R e na espinha central — **sem traço escuro dentro do furo do R**, mantendo o furo luminoso e legível mesmo em `16×16 px`.
   - **Enquadramento e grade de pixels**: `viewBox="0 0 32 32"`, respiro vertical de **`8%`** (cubo ocupando `84%` da altura da placa), coordenadas `X` ajustadas a inteiros (`x = 4, 7, 13, 16, 19, 25, 28`, garantindo que as paredes verticais principais `x = 4, 16, 28` também caiam em inteiros exatos `2, 8, 14` em `16×16 px`) e `Y` ajustado em meio-pixel (`2,5..29,5`, preservando espessura uniforme de `2 px` em todo o aro branco superior isométrico em `32×32 px`).
   - **Decisão para 48 px (pelo print)**: o `48×48 px` dentro de `public/favicon.ico` usa a **versão completa** do cubo (sem linhas de construção, contorno `9,00`, `viewBox 658×658` com `~8,5%` de respiro) dentro da mesma placa arredondada `#FAFAF8` (`rx 21%`, borda `#E4E3DF` de `1 px`), pois na inspeção ampliada 4× a porta, a janela, a sombra e as letras W e R ficam completamente nítidas e fiéis à marca.

3. **Ícones de Android e iOS + `site.webmanifest`**:
   - `public/icon-192.png` e `public/icon-512.png` (`"purpose": "any"`): placa arredondada `#FAFAF8` (`rx 21%`, borda `#E4E3DF` `0,4%`) com **cantos externos transparentes** (`alpha = 0` em `(0,0)`), `viewBox 726×726` (~12% margem) e contorno oficial `5,50`.
   - `public/icon-maskable-512.png` (`"purpose": "maskable"`): novo arquivo gerado pelo mesmo pipeline com fundo quadrado opaco `#FAFAF8` (`alpha = 255` em `(0,0)`) e `viewBox 740×740`, mantendo 100% do cubo dentro do círculo seguro central de `80%` (diâmetro máximo ocupado = `75,9%`).
   - `public/apple-touch-icon.png` (`180×180`): mantido com fundo quadrado opaco `#FAFAF8` (`alpha = 255` em `(0,0)`), porque o iOS aplica máscara arredondada automaticamente.
   - `public/site.webmanifest`: atualizado com `purpose: "any"` em `icon-192.png` e `icon-512.png` e nova entrada `icon-maskable-512.png` com `purpose: "maskable"`.

## 2. Tamanhos dos arquivos gerados (9/9 reprodutíveis byte-a-byte)

| Arquivo | Tamanho | Observação |
|---|---|---|
| `src/assets/logo/whiteroom-logo.svg` | `7,55 KB` (`7.732 B`) | Inalterado (0 B diff vs rodada 1) |
| `src/assets/logo/whiteroom-logo-header.svg` | `6,81 KB` (`6.971 B`) | Inalterado (0 B diff vs rodada 1) |
| `public/favicon.svg` | `1,27 KB` (`1.297 B`) | Simplificado 32×32 na placa `#FAFAF8` (era `6,81 KB`) |
| `public/favicon.ico` | `4,62 KB` (`4.729 B`) | 16/32 simplificados + 48 completo na placa `#FAFAF8` |
| `public/apple-touch-icon.png` | `7,46 KB` (`7.634 B`) | 180×180 quadrado opaco `#FAFAF8` |
| `public/icon-192.png` | `10,30 KB` (`10.548 B`) | 192×192 placa arredondada `any` (cantos transparentes) |
| `public/icon-512.png` | `28,80 KB` (`29.493 B`) | 512×512 placa arredondada `any` (cantos transparentes) |
| `public/icon-maskable-512.png` | `21,17 KB` (`21.676 B`) | 512×512 quadrado opaco `maskable` (zona segura 80%) |
| `public/site.webmanifest` | `0,52 KB` (`528 B`) | `any` (192, 512) + `maskable` (512) |

## 3. Métricas do gate (`docs/gauntlet/t5/rodada-2/metricas.json`)

- **`astro check`**: OK (`12,03 s`) · **`astro build`**: OK (`5,38 s`) · **Console**: `0 erros`, `0 avisos`, `0 pageErrors`.
- **Reprodutibilidade do gerador**: **9/9 ativos byte-a-byte idênticos**, sem gradientes/filtros/imagens.
- **Fidelidade SVG 1024×1024 vs T2 R7**: **`0,0000%`** (`0 / 1.048.576 px`, meta `≤ 0,5%`).
- **Troca 3D (`2,59 s`) → SVG (`2,61 s`)**: Desktop **`0,0000%`** (`0 px`) · Mobile **`0,0022%`** (`65 px`, meta `≤ 0,5%`).
- **Voo, fade do fundo e recorte 4× do header**: fundo em `2,85 s` = **`0,50`**; diff pouso↔header = **`0,0319%`** (`1 / 3.136 px`).
- **Pose final T4 (`2,4 s` vs T2 R7)**: **`0,0000%`** (`0 px`, meta `≤ 0,3%`).
- **Desempenho HLR médio**: Desktop **`0,941 ms`** · Mobile **`0,988 ms`** (meta `≤ 4,0 ms`).
- **Testes de fluxo, regressão e favicons**: **11/11 OK** — incluindo HTTP 200 nas 7 rotas (`/favicon.svg`, `/favicon.ico`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/site.webmanifest`), 4 links no `<head>`, ausência de `prefers-color-scheme`, cantos transparentes nos ícones arredondados e cantos opacos no `apple-touch-icon` e `icon-maskable-512`.

## 4. Evidência visual principal

- `docs/gauntlet/t5/rodada-2/favicon.png`: mostra os 7 tamanhos (`16`, `32`, `48` em 4× nearest-neighbor, `180`, `192 any`, `512 any`, `512 maskable`) e a simulação de aba de navegador (`16 px` ICO e `favicon.svg` ao lado de "WhiteRoom") sobre os três fundos: claro (`#FAFAF8`), branco (`#FFFFFF`) e escuro (`#202124`).
