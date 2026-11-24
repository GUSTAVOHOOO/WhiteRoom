# Passagem de bastão: orquestração da splash WhiteRoom

Data: 2026-11-23. De: orquestrador anterior (Claude Code). Para: novo orquestrador (Claude Opus 5.5, esforço high).

Você é o **orquestrador**. Não implemente você mesmo: escreva briefings, despache workers, revise diffs, rode gates, faça merges e converse com o dono. Fale com o dono em **português**, frases simples (ele usa voz, a transcrição vem bagunçada; interprete com boa vontade).

## O produto
Splash screen da home do site WhiteRoom (Astro 7 + TS + Tailwind 4 + Three.js r187 + GSAP 3.15). A logo (cubo isométrico aberto em cima: parede W preta, parede R ocre, quarto branco com porta e janela, linhas finas de construção) se monta em 3D e depois encolhe até a logo do header. Plano original: `SPLASH-THREEJS.md`. Referência visual que manda em tudo: `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`.

## Decisões fechadas com o dono (não reabrir)
- O 3D é a fonte da verdade; a logo SVG final sai da projeção do 3D (mesma câmera ortográfica). No fim da animação o 3D troca pelo SVG.
- 3 peças: W (parede frontal esquerda, inclui a quina da frente), R (frontal direita), quarto branco (2 paredes do fundo). Ocre `#CD9016`. Cores chapadas.
- Sombra: real e dura (2 tons) durante a animação, com luz fixa casada com o JPG; no fim vira polígonos (no SVG).
- Contorno e linhas: agora são **SVG vetorial com HLR** (remoção de linhas ocultas) sobre o canvas — ver `docs/pesquisa-renderizacao-linhas-threejs.md` e `docs/gauntlet/t2/plano-linhas.md` (worktree T2).
- **Coreografia aprovada (protótipo T0)**: nada gira. Linhas de construção crescem a partir dos asteriscos dos vértices; W entra do canto inferior esquerdo e R do inferior direito, subindo numa leve diagonal, cada um batendo seco com rebote (W 0,30–0,70 s, R 0,85–1,25 s); o quarto branco cai reto de cima como peso (1,60–1,90 s) com achatamento ~7%, tremor 2–3 px e pulso nas linhas; pausa; encolhe em linha reta até o header (2,60–3,10 s). Referência de código: `git show GUSTAVOHOOO/splash-t0-prototipo:src/scripts/prototipo-t0/main.ts`. O fundo da splash deve sumir **durante** o voo (hoje o contrato da T3 só faz o fade depois de `tocar()` resolver — ajustar na T5).
- Só na home.
  - **Toca em todo carregamento, inclusive no reload.** Decisão do dono em 2026-11-24; o `sessionStorage` foi removido. A restauração pelo botão voltar (bfcache) não repete.
  - **Barra de carregamento enquanto carrega**, no estilo das linhas de construção: trilho `#A8A8A4` com asteriscos, preenchimento `#171717`, "carregando" e a porcentagem. O progresso é real, por etapas. A barra não aparece se tudo ficar pronto em menos de 150 ms.
  - **Fallback** (a logo SVG voa): só entra se o carregamento passar de 10 s ou falhar.
  - **Redes de segurança:** a de 3 s e o teto de 8 s contam a partir do início da animação.
  - **Pular:** clique, toque, Esc, Enter ou Espaço (~300 ms).
  - **Movimento reduzido:** logo parada ~600 ms + fade.
  - **Celular:** mesma animação, cubo ~55% da menor dimensão no retrato.
  - **Entradas:** o W e o R entram acelerando (`power2.in`) e batem seco, com tremor de ~2,4 px. O quarto continua sendo o impacto mais forte.
- **Formas e cores do cubo estão APROVADAS pelo dono** (2026-11-23, depois da rodada 6). **Não mexer em `w.svg`** nem nos perfis; não mexer na cor do R. Perfis: cubo perfeito, W assimétrico igual ao JPG, parede uniforme 135/1000.

## Estado do repositório
- `main` (checkout em `C:/Users/Windows 11/Documents/WhiteRoom`): Initial → T3 (header de teste + estrutura da splash, `src/scripts/splash/{contrato,controlador,animacao(stub),logo}.ts`, `src/components/{Header,Splash}.astro`) → T1 (perfis `src/assets/logo/perfis/*.svg` + `perfis.md`, página `/prototipo-t1`) → pesquisas em `docs/`.
- Branch `GUSTAVOHOOO/splash-t0-prototipo` (worktree `C:/Users/Windows 11/orca/workspaces/WhiteRoom/splash-t0-prototipo`): protótipo descartável da coreografia, **não mergear**; serve de referência.
- Branch `GUSTAVOHOOO/splash-t2-cubo` (worktree `C:/Users/Windows 11/orca/workspaces/WhiteRoom/splash-t2-cubo`): cubo 3D parado, **ainda não mergeado**. Leia `docs/gauntlet/t2/estado.md` lá (arquitetura de `src/scripts/splash/cena/`, módulo HLR em `cena/linhas/`, modos `/?debug`, `/?debug=captura`, `/?debug=hlr`, gates `node tools/gauntlet/t2-rodada.mjs <n>` na porta 4403, histórico).
- Histórico do Gauntlet T2 (diff% / nota do crítico): r1 2,90/6 · r2 2,86/7 · r3 2,62/8 · r4 2,58/7,5 · r5 2,51/7,5 · r6 2,53/8,2 (linhas em SVG com HLR; melhor rodada). Falhas restantes do crítico na r6 são do W/R que o dono **aceitou** — não perseguir.

## Próximos passos (em ordem)
1. ~~**T2 rodada 7**~~ **FEITO e aprovado pelo dono (2026-11-23), T2 mergeada na `main` (`67378c4`).** Construção `#A8A8A4` 1,15 px como retas puras, WebGL até dpr 3, AA 8× nas bordas de sombra. Detalhes em `docs/gauntlet/t2/rodada-7/notas.md`. **Atenção T4:** o alinhamento canvas↔SVG com `scrollbar-gutter: stable` (dimensionar pelo `clientWidth/clientHeight` do container, não por `window.innerWidth`) só foi corrigido em `cena/debug.ts`; a splash real (`animacao.ts`/controlador) precisa fazer o mesmo.
2. ~~**T4**~~ **FEITO e aprovado pelo dono (2026-11-24), mergeado na `main` (`aa4298d`).** 4 rodadas (notas do crítico 6,5 → 6,8 → 7,4; a rodada 4 foi pedido do dono). Regras novas do dono: **peça que encostou na pose final não sai mais dali** (sem quique que reabre fresta; impacto = tremor rígido da cena inteira ≤ 2 px + pulso nas linhas); **a logo SVG provisória não aparece no carregamento** (só no fallback e no movimento reduzido). Pendências aceitas pelo dono: a linha interna `ehPonteW` cresce junto com a entrada do W (ele achou ok); o pouso do 3D encolhido no header tem serrilhado/pontos, resolver na T5 trocando para SVG. Detalhes em `docs/gauntlet/t4/estado.md`.
   Texto original: **T4 — animação real + sombras** (difícil → `gemini-4-neon-xhigh`, Gauntlet com crítico `gemini-4-hydrogen-xhigh` julgando capturas em tempos fixos 0,3/0,7/1,25/1,9/2,6 s contra a coreografia aprovada e o protótipo T0). Implementar `criarAnimacao` em `src/scripts/splash/animacao.ts` cumprindo `contrato.ts`, usando a cena da T2 e o HLR (`atualizar()` por quadro). Timeline GSAP determinística (seek), tudo no relógio da timeline.
3. ~~**T5**~~ **FEITO e aprovado pelo dono (2026-11-24), mergeado na `main` (`37ce82a`).** Rodada 1: gerador reprodutível `tools/gauntlet/gerar-logo-svg.mjs` (render 4096 → paleta → polígonos + HLR), `src/assets/logo/whiteroom-logo.svg` (7,55 KB) e `whiteroom-logo-header.svg` (6,81 KB, sem linhas de construção), troca 3D→SVG em 2,60 s com diff ≈ 0, voo do SVG com fade das linhas e do fundo; animação/voo/pouso aprovados pelo crítico. Rodadas 2–5: favicons (placa clara `#FAFAF8` com borda `#D6D5D0` sempre, versão simplificada para 16/32 px, ícones Android `any` arredondados + `maskable`, `apple-touch-icon` opaco). Notas do crítico 7,5 → 8,3 → 7,8 → 8,5 → 8,8. Pendência aceita pelo dono: `favicon.svg` em 16 px ainda fecha um pouco o vão do W e a borda de 2 px encosta no topo do cubo em 32 px. Gate: `node tools/gauntlet/t5-rodada.mjs <n>`. Detalhes em `docs/gauntlet/t5/estado.md`.
   Texto original: **T5 — SVG final + transição** (`gemini-4-neon-high`): gerar a logo SVG final do 3D (linhas via `paraSvgString()` do HLR + faces/sombras projetadas como polígonos), trocar no último quadro sem pulo (diff ≈ 0 entre último quadro 3D e SVG), substituir a logo provisória do header (`src/scripts/splash/logo.ts`), voo até o header com fade do fundo durante o voo.
4. ~~**T6**~~ **FEITO e aprovado pelo dono (2026-11-24, "ficou perfeito"), mergeado na `main` (`5b3dd9d`).**
   - **R1:** enquadramento retrato ~55%; `100dvh`; toque sem clique fantasma; pouso com snap em CSS px (vale para todos os dpr, inclusive 1,25, 1,5 e 2); WebGL com dpr ≤ 2 no celular.
   - **R2:** splash em todo carregamento + barra de carregamento. Causa do bug do primeiro carregamento: o `animacao.js` (~170 KB gzip) não baixava em 800 ms.
   - **T6b (em paralelo):** entradas do W e do R com mais força; glitch da perna do R no celular corrigido (caminho em retrato, z-fighting e emenda falsa no HLR).
   - **Gates:** `node tools/gauntlet/t6-rodada.mjs <n>` (produção, porta 4403) e `t6b-rodada.mjs` (porta 4404).
   - Detalhes em `docs/gauntlet/t6/estado.md` e `docs/gauntlet/t6b/estado.md`.
5. **Próximo:** não há fase planejada depois da T6. Combinar com o dono.

## Como orquestrar (regras do dono)
- **Workers só pelo Antigravity CLI** (`--agent antigravity` no Orca), modelos Google. Construtor `gemini-4-neon-*`: **xhigh só em tarefa difícil**, high/medium nas tranquilas. Crítico do Gauntlet: `gemini-4-hydrogen-xhigh`, **sempre um worker novo por rodada**, sem histórico, só vê JPG/captura/sobreposição/diff/métricas, responde PASS/FAIL + até 3 falhas + nota (modelo do briefing do crítico: ver `docs/gauntlet/t2/rodada-*/critica.md` para o formato). O construtor corrige só a falha nº 1 por rodada; teto de rodadas combinado com o dono; ficar com a melhor rodada.
- **Janela de contexto dos workers ≤ 45%.** O `agy` não mostra o % de contexto, então: crítico novo a cada rodada; construtor trocado a cada 2 rodadas com passagem de bastão via arquivo `estado.md` (o construtor escreve; você faz `orca orchestration worker-release` do antigo e inicia um novo com `--worktree "path:<worktree>"`).
- Use a skill `orchestration` do Orca (`orca skills get orchestration`). Run atual: `run_3119faebfeed` (pode criar uma nova).
- **Armadilhas vistas:**
  - `worker-start --worktree new-child` criou worktrees a partir do commit inicial, não da `main` local. Passe `--base-branch main` ou faça `git merge --ff-only main` na worktree antes do worker escrever.
  - Às vezes o Orca não acorda o coordenador quando chega `worker_done`; se demorar, rode `orca orchestration check --run <run> --terminal <seu handle>`.
  - Às vezes o worker do `agy` termina sem `worker_done`; confira `worker-read` e o git log da worktree. Mensagens para um dispatch que nunca confirmou o início ficam presas: `worker-abandon` + novo `worker-start --terminal <handle>`.
  - `agy -p` nega ações não aprovadas em silêncio e sai com 0: sempre confira `git diff`/`git log` do worker.
  - Só um `astro dev` por projeto/worktree (use `--force` para substituir).
- Revise o código dos workers de verdade (a T3 tinha um bug de tela presa e outro no teto de 8 s que só a revisão pegou).
- **Commits/merges locais na `main` sem perguntar; nunca `push`.** Mensagens de commit terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Merge com `--no-ff`.
- Pontos de aprovação do dono: mostre o resultado visual (túnel/print) antes de mergear algo que muda a aparência.

## Servidores e túnel (podem ter caído com a sessão anterior)
- Dev server da worktree T2 em `http://localhost:4405` iniciado com `npx astro dev --port 4405 --allowed-hosts .trycloudflare.com --force`.
- Túnel Cloudflare rápido: `cloudflared tunnel --url http://localhost:4405 --no-autoupdate` (último endereço: `https://blend-different-vary-tvs.trycloudflare.com/?debug`; muda a cada novo túnel). O link é público: avise o dono e desligue quando ele terminar.
- Se não estiverem no ar, suba de novo e mande o novo link ao dono.
- **Memória curta na máquina** (chegou a 1,1 GB livres): no máximo **um** dev server e **um** túnel por vez, no máximo 2 workers `agy` ao mesmo tempo. Suba servidor/túnel só quando o dono for ver.
