# T6 — Estado do Gauntlet Loop (Passagem de Bastão → Pós-Rodada 2)

Branch: `GUSTAVOHOOO/splash-t6-celular` · Base: `e74177f docs: handoff atualizado apos merge da T5`.
Nenhuma dependência nova foi adicionada ao `package.json` da raiz (nem a `tools/gauntlet/package.json`).
Coreografia `0–3,10 s`, perfis SVG (`src/assets/logo/perfis/*.svg`), geometria da pose final, cores (`constantes.ts`, `materiais.ts`), luz (`luz.ts`), shader de sombra (AA 8×), logos SVG (`whiteroom-logo.svg`, `whiteroom-logo-header.svg`) e todos os favicons/ícones estão **intactos** (`gerar-logo-svg.mjs --check` = 9/9 byte a byte). Desktop `1280×800` e `1920×1080` permanecem **0,0000% diff** contra T5.

## 1. Arquitetura das Mudanças da T6 (Rodadas 1 e 2)

| Arquivo | Papel na T6 |
|---|---|
| `src/scripts/splash/cena/camera.ts` | Adicionados `ESCALA_ENQUADRAMENTO_RETRATO = 1.175` e `calcularEscalaEnquadramento(largura, altura)` (`1.175` em retrato, `1` caso contrário). `atualizarEnquadramentoCamera(camera, w, h, escalaEnquadramento = 1)` retrocompatível. |
| `src/scripts/splash/cena/linhas/svg.ts` | Quando `escalaCubo > 1` (retrato), mantém a espessura das linhas HLR idêntica à do `whiteroom-logo.svg` ampliado. |
| `src/scripts/splash/cena/linhas/construcao.ts` | (R2) Exporta `gerarPathAsterisco2D(raioPx = 6.5)` usando `DX_EIXO_PX`, `DY_EIXO_PX`, `ESCALA_PX_POR_UNIDADE` e `COSSENO_ELEVACAO` para reaproveitar os asteriscos dos vértices nas pontas da barra de carregamento sem puxar Three.js. |
| `src/scripts/splash/barra.ts` | (R2) Controlador da barra de carregamento: progresso monotônico real com creep suave entre etapas, limiar anti-pisca de `150 ms`, exibição mínima de `500 ms`, pausa curta em `100%` (`80 ms`), fade de saída de `200 ms`, modo movimento reduzido sem animações decorativas (salto direto entre etapas), e métricas para telemetria. |
| `src/scripts/splash/animacao.ts` | (R1) `recalcularLayout()` com escala retrato e `snapLayoutCssPx = Math.round`, WebGL `dpr <= 2` só quando `min(w, h) <= 500`, listeners `orientationchange` e `visualViewport.resize`. (R2) `aquecerShaders()` renderiza uma passagem única de aquecimento (3 peças + shadow map) com canvas oculto antes de restaurar `t = 0`, eliminando travadas na entrada das peças (`CPU 4× rAF p95 = 20,4 ms`, `1/323` quadros > 33 ms). |
| `src/components/Splash.astro` | (R1) `#wr-splash` com `overflow-hidden overscroll-none touch-none` e `100dvh`. (R2) Markup `[data-splash-barra]` centralizado sobre `bg-papel` (trilho `1,15 px` `#A8A8A4` largura `min(240px, 50vw)`, preenchimento `2 px` `#171717`, dois asteriscos isométricos nas pontas, rótulo `"carregando"` + porcentagem em `tabular-nums`). |
| `src/pages/index.astro` | (R2) Removido `sessionStorage` (`wr-splash-vista`): splash toca em todo carregamento/reload da home; listener `pageshow` (`event.persisted`) garante que voltar pelo histórico (bfcache) não repita; failsafe inline elevado de `3 s` para `12 s` (só age se o módulo do controlador nunca rodar); registra `window.__wrSplashHeadInicio`. |
| `src/styles/global.css` | (R1) Trava de scroll mobile em `html.splash-ativa` e `body`, escala `117.5%` de `[data-splash-logo]` em retrato. (R2) `[data-splash-barra]` inicia oculta por padrão; em `splash-reduzida`, `[data-splash-logo]` só aparece após `splash-reduzida-pronta` (evita sobreposição com a barra em carregamento lento). |
| `src/scripts/splash/controlador.ts` | (R1) Anti-clique fantasma e `touchmove` `passive: false`. (R2) Removido timeout de `800 ms`; carregamento real em 4 etapas (fontes `15%`, imagens primeira dobra `15%`, import 3D `45%`, cena + shaders `25%`); limite de carregamento de `10 s` (barra some → fallback SVG); rede de segurança de `3 s` e teto absoluto de `8 s` contam a partir do início da animação; pular durante a barra dissolve a overlay em `250 ms` sem exibir logo de reserva; `?splash=lento` (`3 s`), `?splash=falha`, `?splash=forcar` (sem efeito); expõe `window.__wrSplashEstado`. |
| `src/scripts/splash/cena/debug.ts` | (R2) Adicionado `/?debug=barra` para capturas determinísticas da barra (`10%`, `50%`, `90%`, `100%`, fade); todos os modos `/?debug*` existentes intactos. |
| `tools/gauntlet/t6-rodada.mjs` | Gate completo em produção (`astro build` + `astro preview` na porta `4403`, desligado no `finally`): toda a regressão R1 + cache frio Fast 3G e Slow 3G (CPU `4×`), reload e bfcache real (`pageshow` `persisted: true`), carregamento rápido (cache quente sem piscar), `?splash=lento` com prova de monotonicidade quadro a quadro, `?splash=falha` e limite de `10 s` simulado, pular durante a barra (mobile + desktop), e capturas da barra incluídas na `folha-contato.png`. |

## 2. Como rodar o gate da T6

```sh
# Instalar dependências isoladas do gauntlet (se worktree nova)
npm --prefix tools/gauntlet ci

# Rodar o gate completo da T6 (rodada <n>)
node tools/gauntlet/t6-rodada.mjs <n>
```

## 3. Decisões técnicas e armadilhas evitadas

1. **Causa raiz do bug de primeiro carregamento no celular**: no baseline de produção, `animacao.js` (`168,9 KB` gzip / `643,4 KB` raw) levava `999 ms` só de download em Fast 3G e `> 3,4 s` em Slow 3G, fazendo `TIMEOUT_3D_MS = 800 ms` disparar antes do download terminar. Em redes mais lentas ou `astro dev` via túnel, o failsafe inline de `3 s` em `index.astro` derrubava `splash-ativa` antes do módulo iniciar; e `sessionStorage` bloqueava o reload na mesma aba.
2. **BFCache real no Playwright**: o Playwright passa `--disable-back-forward-cache` por padrão e `page.goBack({ waitUntil: 'load' })` trava quando o bfcache restaura a página (pois o evento `load` não dispara novamente, só `pageshow` com `persisted: true`). No gate, removemos a flag via `ignoreDefaultArgs: ['--disable-back-forward-cache']` e usamos `goBack({ waitUntil: 'commit' })`, comprovando bfcache genuíno (`persisted: true`, zero blockers).
3. **Aquecimento de shaders em passagem única**: em `animacao.ts`, omitir a renderização `t = 0` redundante antes do aquecimento e fazer uma única passagem `renderer.render(scene, camera)` com todas as malhas visíveis (sem `renderer.compile` duplicado) manteve `pronto` em `661,9 ms` sob CPU `4×` e baixou `rAF p95` para `20,4 ms` (`1/323` quadros > 33 ms).
4. **Snap de coordenadas do pouso em todos os DPRs (`1`, `1,25`, `1,5`, `2`, `3`)**: mantido `snapLayoutCssPx = (v) => Math.round(v)` + `lado` inteiro em CSS px (`0,0000%–0,0204%`).

## 4. Tabela de rodadas

| Rodada | Resumo | Check / Build / Console | Gerador 9/9 | Desktop vs T5 | Pouso `390×844` / DPR frac. | CPU 4× (`pronto` / `rAF p95`) | Cache frio Fast 3G / Slow 3G (barra · total · 3D) | Reload / BFCache / Rápido / Lento / 10s / Pular barra | Regressão T5 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Escala retrato `1.175` (~55%), `100dvh` + trava scroll, anti-clique fantasma, snap CSS px no pouso retina, WebGL `dpr <= 2` só celular (`<= 500 px`), gate `t6-rodada.mjs` | OK / OK / 0 err, 0 warn | **9/9 OK** | **`0,0000%`** | **`0,0035%`** / `0–0,0204%` | `474–645 ms` / `20,4–30,8 ms` | *(n/a)* | *(n/a)* | **11/11 OK** |
| 2 | Splash em todo load (sem `sessionStorage`, bfcache preservado), barra de carregamento com asteriscos isométricos + 4 etapas reais + aquecimento shaders, limite `10 s`, redes `3 s`/`8 s` pós-início da animação, failsafe inline `12 s` | OK / OK / **0 err, 0 warn** | **9/9 OK** | **`0,0000%`** | **`0,0035%`** / **`0–0,0204%`** | **`661,9 ms`** / **`20,4 ms`** (`1/323 > 33ms`) | **Fast 3G**: `1938,5 ms` · `5683 ms` · 3D OK / **Slow 3G**: `4821,6 ms` · `9682 ms` · 3D OK (0 fallback) | **OK / OK (`persisted: true`) / OK (`120 ms`, sem barra) / OK (`411` quadros, `0` quedas) / OK (`10564 ms`) / OK (`264 ms`)** | **11/11 OK** |

## 5. Passagem de bastão

- Todos os critérios do gate `node tools/gauntlet/t6-rodada.mjs 2` passaram com `0` erros e `0` avisos de console.
- Evidências em `docs/gauntlet/t6/rodada-2/` (`folha-contato.png`, `metricas.json`, `notas.md`, capturas da barra em `390×844` e `1280×800`, recortes 4× do header e rotações).
- Processo `astro dev` na porta `4405` permaneceu intacto durante toda a rodada.
