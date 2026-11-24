# T6 — Rodada 2: Diagnóstico do Primeiro Carregamento, Splash em Todo Load e Barra de Carregamento

Data: 2026-11-24 · Branch: `GUSTAVOHOOO/splash-t6-celular` · Base: `f03f48e T6 rodada 1: snap pelo dpr real e pouso em dpr fracionário`.

## 1. Causa Real do Problema no Primeiro Carregamento (Confirmada em Produção)

Antes de alterar o código, rodamos `astro build` + `astro preview` (porta `4403`) com **cache frio** (`Network.setCacheDisabled: true`), CPU `4×` e emulação de rede CDP em `390×844 dpr 3`.

### Tamanhos reais do bundle de produção (baseline)
- `Splash.astro_...js` (controlador + GSAP): **`33,7 KB` gzip** (`84,7 KB` raw)
- `animacao.*.js` (Three.js + cena 3D + HLR + coreografia): **`168,9 KB` gzip** (`643,4 KB` raw)
- `index.*.css`: **`3,3 KB` gzip** (`10,5 KB` raw)

### Linha do tempo medida no baseline (antes da correção)

| Perfil (cache frio, CPU 4×) | `Splash.js` pronto | `iniciarSplash()` | `animacao.js` download | Evento que interrompeu a splash | Resultado |
|---|---|---|---|---|---|
| **Fast 3G** (1,6 Mbps, 150 ms RTT) | `560 ms` | `584 ms` | `587 → 1586 ms` (`999 ms`) | `TIMEOUT_3D_MS` (800 ms) disparou em **`1398 ms`** — **188 ms antes** do download de `animacao.js` terminar | **Fallback** em `1398 ms`, encerrou em `1912 ms`; animação 3D nunca tocou |
| **Slow 3G** (400 Kbps, 400 ms RTT) | `1634 ms` | `1665 ms` | > `3400 ms` (incompleto) | `TIMEOUT_3D_MS` (800 ms) disparou em **`2487 ms`** com < 25% de `animacao.js` baixado | **Fallback** em `2487 ms`, encerrou em `2991 ms`; animação 3D nunca tocou |
| **2G / alta latência** (150 Kbps, 900 ms RTT) | `3909 ms` | `3961 ms` | > `9000 ms` | Na margem do **failsafe inline de 3 s** em `index.astro` (em `astro dev` via túnel Cloudflare, com dezenas de módulos ESM sem bundle e TLS frio, o módulo ultrapassava 3 s e `index.astro` removia `splash-ativa` **antes** de `iniciarSplash()` rodar) | Site abria direto sem splash ou caía em fallback |

### Por que só tocava ao abrir o link de novo
1. **Causa principal em produção (`TIMEOUT_3D_MS = 800 ms`)**: com cache frio em rede móvel, só o download de `animacao.js` (`168,9 KB` gzip) já leva `~1,0 s` em Fast 3G e `~3,4–4,0 s` em Slow 3G, sem contar parse + criação da cena + compilação WebGL. O timeout de 800 ms sempre estourava antes do 3D ficar pronto.
2. **Causa em rede muito lenta / dev via túnel (failsafe inline de `3 s` em `index.astro`)**: a rede de segurança contava 3 s a partir do `<head>`; quando o módulo do controlador ainda estava baixando, `index.astro` removia `splash-ativa` e o site abria direto sem nenhuma animação.
3. **Causa no reload (`sessionStorage` `wr-splash-vista`)**: o `<head>` já gravava `wr-splash-vista = '1'` no primeiro carregamento. Recarregar a mesma aba pulava a splash; só abrir o link em outra aba (novo `sessionStorage`, mas agora com o cache HTTP já aquecido) fazia `Splash.js` e `animacao.js` carregarem em `< 200 ms`, passando abaixo dos 800 ms e finalmente tocando o 3D.

---

## 2. O Que Mudou na Rodada 2

1. **Splash em todo carregamento da home (sem `sessionStorage`, respeitando bfcache)**:
   - Removido `wr-splash-vista` / `sessionStorage` de `src/pages/index.astro`. A splash agora toca em todo carregamento e reload da home (continua exclusiva da home).
   - Adicionado listener `pageshow` para `event.persisted === true` (bfcache): voltar pelo histórico a partir de outra página restaura a página exatamente como estava, sem repetir a splash.
2. **Barra de carregamento na linguagem da marca (`src/scripts/splash/barra.ts` + `src/components/Splash.astro`)**:
   - Centralizada sobre `bg-papel`, mantendo `[data-splash-logo]` oculta no carregamento normal.
   - Trilho fino (`1,15 px`, `#A8A8A4`, largura `min(240px, 50vw)`), preenchimento `#171717` (`2 px`) crescendo da esquerda para a direita (`scaleX`), sem spinner, sem gradiente, sem sombra.
   - Extremidades com os **mesmos asteriscos isométricos** dos vértices da animação: nova função pura `gerarPathAsterisco2D()` exportada de `src/scripts/splash/cena/linhas/construcao.ts` (reaproveitando `DX_EIXO_PX`, `DY_EIXO_PX`, `ESCALA_PX_POR_UNIDADE`, `COSSENO_ELEVACAO`, `CORES.linhaConstrucao` e `ESPESSURA_LINHA_CONSTRUCAO_1024_PX`, sem puxar Three.js para o bundle inicial).
   - Legenda discreta abaixo (`carregando` + porcentagem em `tabular-nums`, cinza `#767672`, fonte do site).
   - **Progresso real e monotônico em 4 etapas**:
     1. Fontes (`document.fonts.ready`) — `15%`;
     2. Imagens visíveis na primeira dobra — `15%`;
     3. Import do módulo 3D (`import('./animacao')`) — `45%`;
     4. Cena criada, shaders aquecidos (`aquecerShaders()` em `animacao.ts` renderizando as 3 peças + shadow map com o canvas oculto antes de restaurar `t = 0`) — `25%`.
     Dentro de etapas demoradas, avança devagar em direção ao próximo marco e só atinge `100%` quando tudo está pronto.
   - **Regras anti-pisca**: se tudo ficar pronto em `< 150 ms`, a barra nunca aparece; se aparecer, fica visível pelo menos `500 ms`, completa até `100%` (breve pausa de `80 ms`) e sai com fade de `200 ms`, iniciando a animação 3D logo em seguida.
   - **Movimento reduzido**: aguarda fontes + imagens da primeira dobra; se aparecer, atualiza sem animações decorativas (salto direto entre etapas) e segue para o modo reduzido (`600 ms` + fade `300 ms`).
   - **Pular durante a barra**: toque, clique ou Esc/Enter/Espaço cancela o carregamento, dissolve a overlay em `250 ms` sem exibir a logo SVG de reserva e protege contra clique fantasma no celular.
3. **Tempos e redes de segurança (`src/scripts/splash/controlador.ts` e `src/pages/index.astro`)**:
   - Removido o fallback de `800 ms` do caminho normal.
   - Novo limite de carregamento de **`10 s`**: se exceder 10 s ou se o import falhar, a barra some imediatamente e entra o fallback (logo SVG voa até o header).
   - **Rede de segurança de `3 s` e teto absoluto de `8 s`** passam a contar **a partir do início da animação** (não do carregamento).
   - Failsafe inline em `index.astro` ajustado para **`12 s`** (só age se o módulo do controlador nunca rodar).
   - `?splash=lento` simula import lento (`3 s`), `?splash=falha` força fallback, `?splash=forcar` aceito sem efeito, modos `/?debug*` preservados (adicionado `/?debug=barra` apenas para capturas determinísticas da barra).

---

## 3. Resultados Medidos no Gate de Produção (`node tools/gauntlet/t6-rodada.mjs 2`)

Build + `astro preview` isolado na porta `4403` (encerrado ao fim), **0 erros e 0 avisos de console**.

### 3.1 Primeira visita com cache frio (`390×844 dpr 3`, CPU 4×)

| Rede (cache frio, CPU 4×) | Tempo da barra | Tempo de carregamento | Início animação 3D | Tempo total (splash / wall) | Barra 100% | Animação 3D inteira | Fallback | Status |
|---|---|---|---|---|---|---|---|---|
| **Fast 3G** (1,6 Mbps, 150 ms RTT) | **`1938,5 ms`** | `1818,0 ms` | `2339,8 ms` | **`5455,0 ms`** (`5683 ms` wall) | Sim | Sim (canvas + voo SVG) | **Não** | **OK** |
| **Slow 3G** (400 Kbps, 400 ms RTT) | **`4821,6 ms`** | `5558,4 ms` | `6077,0 ms` | **`9190,6 ms`** (`9682 ms` wall) | Sim | Sim (canvas + voo SVG) | **Não** | **OK** |

### 3.2 Fluxos da barra, recarregamento, bfcache e segurança

| Teste | Resultado medido | Status |
|---|---|---|
| **Reload** | `sessionStorage('wr-splash-vista') === null`, splash toca de novo completa em 3D | **OK** |
| **Voltar pelo histórico (bfcache)** | `pageshow` com `persisted: true`, `splash-ativa: false`, overlay ausente, não repete | **OK** |
| **Carregamento rápido (cache quente)** | Carregou em `120,2 ms` (`< 150 ms`), `barraExibida: false` (nunca pisca) | **OK** |
| **`?splash=lento` + monotonicidade** | `411` quadros amostrados, **`0` quedas** (progresso e %), `0% → 100%`, barra `3535,3 ms`, 3D completo (`6791,1 ms`); `?splash=forcar` aceito OK | **OK** |
| **`?splash=falha`** | Barra oculta, fallback disparado (`motivo: erro`), página utilizável | **OK** |
| **Limite de `10 s` simulado** | Barra exibida até `67%` (nunca 100%), some aos ~10 s, fallback entra (`motivo: timeout-10s`), encerra em `10564 ms`, página utilizável | **OK** |
| **Pular durante a barra** | Celular (toque): `264 ms`, `0` cliques fantasma, logo de reserva nunca exibida; Desktop (`Escape`): `256 ms`, logo de reserva nunca exibida | **OK** |

### 3.3 Regressão Completa da Rodada 1 e Desempenho (`390×844 dpr 3`)

| Critério | Resultado | Status |
|---|---|---|
| `astro check` / `astro build` / Console | OK / OK / **0 erros, 0 avisos** | **OK** |
| `gerar-logo-svg.mjs --check` | **9/9 byte a byte** | **OK** |
| Enquadramento (8 viewports) + entradas fora da tela | Retrato/tablet **`54,89–54,92%`**; paisagem `+26,3` / `+19,4 px`; desktop vs T5 **`0,0000%`**; pose 1024 vs T2 **`0,0000%`** | **OK** |
| Altura dinâmica (`100dvh`) e rolagem | `scrollY = 0` durante splash, restaurada após fim | **OK** |
| Toque (pular, sem fantasma, drag, duplo) | `328 ms`, `0` fantasma, `scrollY = 0`, duplo `313 ms` | **OK** |
| Rotação (`1,0 s` e `2,7 s`) | Erro pouso `0 / 0,5 px` | **OK** |
| Pouso header (`390×844 dpr 3` + desktop DPR `1,25/1,5/2`) | Mobile `0,0035%` (troca `0,0004%`); desktop `0,0000%–0,0204%` | **OK** |
| **Desempenho CPU 1×** | Pronto `226,7 ms` · `fallback=false` · `rAF med 8,42 ms` / `p95 9,2 ms` (`1/392 > 33 ms`) | **OK** |
| **Desempenho CPU 4×** | Pronto **`661,9 ms`** (`<= 800 ms`) · `fallback=false` · `rAF med 10,55 ms` / **`p95 20,4 ms`** (`1/323 > 33 ms`, melhoria com aquecimento de shaders) | **OK** |
| **Desempenho CPU 6×** | Pronto **`1062,6 ms`** · **`fallback=false`** (não cai mais em fallback) · `rAF p95 39,8 ms` | **OK** |
| Celular reduzido / fallback | Reduzido `975 ms`, fallback `562 ms` | **OK** |
| Regressão T5 | **11/11 OK** | **OK** |

## 4. Evidências Geradas
- Folha de contato (inclui capturas da barra em `~10%`, `50%`, `90%`, `100%`, fade de saída e `1º quadro` em `390×844` e `1280×800`, além dos 6 tamanhos × 8 tempos): `docs/gauntlet/t6/rodada-2/folha-contato.png`
- Métricas completas: `docs/gauntlet/t6/rodada-2/metricas.json`
- Capturas individuais da barra: `docs/gauntlet/t6/rodada-2/capturas/barra-{390x844-dpr3,1280x800-dpr1}-{10pct,50pct,90pct,100pct,fade,frame1}.png`
