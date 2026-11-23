# Pesquisa: Gauntlet Loop

Data: 2026-11-23. Fontes: artigo do autor (somethingbig.ai), repositório Claude of Duty, API do GitHub (datas), posts de engenharia da Anthropic, documentação do Antigravity CLI e `agy --help` local.
"Testado" indica comando rodado nesta máquina (Windows 11, `agy` 1.5.15).

## Resumo

- **O termo existe e tem dono.** "Gauntlet Loop" é um método de prompt para agentes criado por Matt Shumer. Artigo "How to Run a Gauntlet Loop", 2026-07-27. [Artigo](https://somethingbig.ai/gauntlet-loop)
- Não é um padrão acadêmico. É uma variante, mais agressiva e multiagente, do loop gerador–avaliador já descrito pela Anthropic. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Ideia central: construtor e crítico **separados**, crítico com contexto limpo, comparação contra uma referência real, repetir até ganhar. [Artigo](https://somethingbig.ai/gauntlet-loop)

## 1. Coisas diferentes com o nome "Gauntlet"

| Nome | O que é | Relevante? |
|---|---|---|
| **Gauntlet Loop** (Matt Shumer) | Método de prompt: construtores + críticos em loop contra uma referência | **Sim.** É o método de trabalho com agentes |
| `robonuggets/gauntlet-loop` | Skill de Claude Code que gera o prompt do método. O README diz: "The gauntlet loop is Matt Shumer's idea." Criado em 2026-08-05 | Derivado, não é a fonte |
| Gauntlet AI | Programa de formação de engenheiros "AI-first", pago por empresas contratantes. A página não menciona o método | Não |

Fontes: [artigo](https://somethingbig.ai/gauntlet-loop), [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop), [Gauntlet AI](https://www.gauntletai.com/about), [API do GitHub](https://api.github.com/repos/robonuggets/gauntlet-loop).

## 2. Origem e publicação

- Autor: Matt Shumer. Artigo "How to Run a Gauntlet Loop", publicado em **2026-07-27** em somethingbig.ai. [Artigo](https://somethingbig.ai/gauntlet-loop)
- O nome vem do projeto **Claude of Duty**: um FPS em Three.js feito a partir de um único prompt. [Artigo](https://somethingbig.ai/gauntlet-loop)
- Repositório criado em **2026-07-25**. Descrição: "A Call of Duty-quality FPS in Three.js, built from a single prompt." [Repositório](https://github.com/mshumer/Claude-of-Duty), [API do GitHub](https://api.github.com/repos/mshumer/Claude-of-Duty)
- O prompt original está em [`prompt.md`](https://github.com/mshumer/Claude-of-Duty/blob/main/prompt.md). Ele pede subagentes por componente, cada um em loop, com um "harsh critic" que compara lado a lado, às cegas, com o Call of Duty real.
- O artigo cita os posts do autor no X (ex.: [status 2081054356405731740](https://x.com/mattshumer_/status/2081054356405731740)). Não consegui abrir o X (HTTP 402). Data e texto dos posts: **não confirmados**.

## 3. Como funciona

Tudo nesta seção vem do [artigo](https://somethingbig.ai/gauntlet-loop), salvo indicação.

### Papéis

| Papel | Função |
|---|---|
| Agente líder | Recebe o objetivo e a referência. Divide o trabalho nas menores partes que podem ser julgadas sozinhas. Cria pares construtor/crítico |
| Construtor | Faz ou revisa a saída da sua parte |
| Crítico | Agente **separado**, com contexto limpo, sem o histórico nem as explicações do construtor. Abre o artefato real, não um resumo. Compara com a referência, de preferência em A/B cego, e aponta a **maior** lacuna |
| Agente de "smoothing" (opcional) | Contexto limpo. Ao fim de cada onda, corrige incoerências entre partes melhoradas em separado |

- Citação: "The builder and critic should be separate agents."
- Citação: "Each piece gets its own builder and a separate critic with fresh context."

### Etapas

1. Dar o destino, não a implementação: "Give it the destination. Let it choose the route."
2. Definir uma barra real: screenshots de referência, os melhores sites da categoria, testes, metas de latência. "A hard bar does not need to be realistically reachable."
3. O líder divide o trabalho.
4. Construir, julgar, corrigir: se a referência vence, o crítico diz a maior lacuna. O construtor corrige. Repete.
5. Acompanhar: pedir ao agente uma página HTML viva ou um `workbench.md` atualizado durante o trabalho.

### Rodadas e parada

- **Sem número fixo de rodadas.** "Do not tell it to do three rounds and stop." Também: sem "arbitrary final round".
- Parar quando o resultado agradar, quando os ganhos ficarem pequenos ou quando o orçamento acabar. O autor parou o jogo ainda melhorando.
- O prompt original manda não parar até cada subagente ficar "utterly wowed". [prompt.md](https://github.com/mshumer/Claude-of-Duty/blob/main/prompt.md)

### Quando falha

- O único mecanismo descrito: o crítico aponta a maior lacuna, o construtor corrige, o crítico julga de novo.
- O artigo **não trata** de escalonamento, construtor travado ou rollback.

### Requisitos

- Um harness agêntico (Claude Code, Codex) que abra arquivos, rode código, renderize, olhe screenshots e crie subagentes. "Do not paste a Gauntlet Loop into a normal Claude chat".
- Preferência do autor: "Claude Code with Opus 5, especially for visual or creative work". Codex é "much weaker than Opus 5 at creating the visual result", mas forte para criticar visual e para back-end.
- Ultracode (via `/effort`): "It costs much more, but the extra effort usually produces better work on large, multi-agent runs."
- Gemini e Antigravity: **não mencionados** no artigo.

## 4. O que o Claude of Duty mostrou

Fonte: [README](https://github.com/mshumer/Claude-of-Duty).

- Cerca de 55 mil linhas em 11 subsistemas, escritas por uma frota de agentes. Sem arquivos de modelo, textura ou som: tudo gerado em código.
- Onze críticos adversariais deram notas de 0 a 10. Evolução: 3,59 → 4,14 → 4,05 → 5,05. Dois shots chegaram a "CLOSE"; o resto ficou "AMATEUR".
- **No A/B cego, todo crítico, em toda rodada, escolheu o frame do Call of Duty real.** O autor admite que a meta não foi atingida: "It does not."
- **Sequencial venceu paralelo:** "Sequential single-owner passes beat parallel fan-out decisively."
  - Três rodadas com seis agentes em paralelo (um diretório cada): +0,46 de nota, e os defeitos foram 60 → 47 → 66.
  - Uma passada sequencial, um dono por preocupação acoplada: +1,00, defeitos 66 → 26.
  - Motivo dado: sistemas acoplados (tonemapping, céu, luz indireta) quebravam as premissas uns dos outros.
- Isto contradiz em parte o artigo, que sugere partes em paralelo. Para visual acoplado, o próprio repositório recomenda sequencial.
- Ferramentas em `tools/`: `capture.mjs`, `shotset.mjs`, `baseline.mjs` (captura reproduzível, uma página nova por shot), `imagediff.mjs`, `profile.mjs`, `playtest.mjs`.
- `imagediff.mjs` é **gate de regressão** com tolerância zero (sai com erro se qualquer pixel mudar). Não compara com a referência; serve para provar que uma mudança é "pixel-neutral".
- Lição de determinismo: subsistemas animados por `performance.now()` em vez do relógio do motor mudavam a saída quando o boot mudava.
- Lição de crítica: os críticos disseram "untextured", mas o problema era especular. A correção certa foi o oposto do pedido. O crítico pode diagnosticar errado.
- Custo da execução: **não informado** no artigo nem no README. O artigo diz só "many hours" e uma frota grande de subagentes.

## 5. Padrões próximos com fonte

### Evaluator-optimizer (Anthropic, 2024-12-19)

- "one LLM call generates a response while another provides evaluation and feedback in a loop." [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Quando usar: "when we have clear evaluation criteria, and when iterative refinement provides measurable value."
- Dois sinais: a resposta melhora quando um humano dá feedback, e o LLM consegue dar esse feedback.

### Gerador–avaliador para front-end (Anthropic, 2026-03-24)

Fonte: [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps), de Prithvi Rajasekaran.

- Auto-avaliação falha: "agents tend to respond by confidently praising the work."
- Separar ajuda: "Separating the agent doing the work from the agent judging it proves to be a strong lever".
- Inspiração declarada em GANs.
- Critérios de design: design quality, originality, craft, functionality. Mais peso nos dois primeiros. Sem pesos numéricos.
- O avaliador usou o **Playwright MCP** para navegar na página viva e tirar screenshots antes de dar nota.
- 5 a 15 iterações por geração, até 4 horas.
- **A última iteração nem sempre é a melhor:** as notas estabilizam, e o autor muitas vezes preferiu uma do meio.
- Cada critério tinha limite mínimo; abaixo dele, o sprint falhava e voltava com feedback. Valores dos limites: não informados.
- Custo: execução solo 20 min e US$ 9; harness completo 6 h e US$ 200 ("over 20x more expensive").
- Quando vale: "when the task sits beyond what the current model does reliably solo". Dentro desse limite, o avaliador virou "unnecessary overhead".

## 6. Quando usar e quando não usar

Da fonte:

- Usar quando a saída pode ser inspecionada e melhorada: código, sites, design, escrita, pesquisa. [Artigo](https://somethingbig.ai/gauntlet-loop)
- Não usar em chat comum. [Artigo](https://somethingbig.ai/gauntlet-loop)
- Usar quando há critério claro e o refinamento traz ganho mensurável. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- Não usar quando o modelo já resolve a tarefa sozinho com confiabilidade: o avaliador vira custo. [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- Custo cresce muito: 20x no caso medido pela Anthropic. [Harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps)

Críticas de terceiros, **não confirmadas** na fonte primária:

- Pieter Levels teria relatado código bagunçado e cerca de US$ 500 perdidos. Só achei resumos no Digg (a página agora dá 404) e não achei o post dele.
- Custo típico de US$ 400 a 800 por projeto: só em blog secundário ([The Prompt Index](https://www.thepromptindex.com/ai-loop-engineering-gauntlet-loop-guide.html)).
- "Barra alta sem verdade de referência amplifica a ideia genérica de premium do modelo" e "subagentes herdam o contexto do construtor e carimbam": opiniões de comentaristas, não verificadas.

## 7. Aplicação ao WhiteRoom (RECOMENDAÇÃO MINHA, não é fato da fonte)

Contexto: Claude Code orquestra workers do `agy` (Gemini) em worktrees do Orca. Tarefa: modelar o cubo-logo em Three.js e animar com GSAP, conferindo contra `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (ver `SPLASH-THREEJS.md`).

### Diferenças em relação ao método original

- **Teto de rodadas.** Shumer é contra. Aqui a referência é uma imagem fixa e alcançável, e a Anthropic viu as notas estabilizarem. Por isso, teto e escolha da melhor iteração, não da última.
- **Sequencial, não paralelo.** W, R e quarto branco dividem câmera, contorno e cores. É o caso acoplado em que o Claude of Duty piorou com fan-out.
- **Gates objetivos antes do crítico.** O crítico LLM só olha o que passou nos gates.

### Papéis

| Papel | Quem | Contexto |
|---|---|---|
| Líder | Claude Code (orquestrador) | Divide em etapas, roda os gates, decide parar |
| Construtor | Worker `agy` (Gemini) em worktree do Orca | Só a etapa atual e a lista de lacunas |
| Crítico | Outro agente, **sem** o histórico do construtor. De preferência outro modelo (ex.: subagente Claude), já que o construtor é Gemini | Recebe só: referência, screenshot, overlay, números do diff |
| Humano | Você | Aprova o resultado final e decide o ocre em aberto |

### Etapas (uma de cada vez)

1. Cubo **parado** (frame final) contra o JPG. É a etapa com referência objetiva.
2. Só depois, animação. A referência só vale para o frame final; os outros frames são julgados por roteiro (tempos da tabela) e pelo crítico.
3. Transição para o menu, pular, fallback.

### Gates objetivos (ordem barata → cara)

1. `npm run check` (`astro check`) com 0 erros.
2. `npm run build` passa.
3. Console do navegador sem erros e sem aviso de WebGL.
4. Captura determinística: viewport fixo igual ao tamanho do JPG, `?debug` desligado, animação pausada no fim. GSAP permite pausar e ir a um tempo exato (`timeline.pause().seek(t)`). [GSAP seek](https://gsap.com/docs/v3/GSAP/Timeline/seek()/) Tudo que anima deve usar o relógio da timeline, não `performance.now()` (lição do [Claude of Duty](https://github.com/mshumer/Claude-of-Duty)).
5. Diff de pixels contra o JPG com `pixelmatch`. Ele devolve o número de pixels diferentes, exige imagens do mesmo tamanho e tem limiar padrão 0,1. A CLI sai com 0 (igual), 66 (diferente), 65 (tamanho diferente). [pixelmatch](https://github.com/mapbox/pixelmatch)
   - O JPG tem compressão e a cena tem anti-aliasing: o diff nunca será zero. Usar **porcentagem** de pixels diferentes como meta, não zero.
   - Calibrar a meta antes: medir o diff de uma versão "boa à mão". Começar com algo como ≤ 2% e ajustar.
   - Gerar a imagem de diff e entregar ao crítico junto com o overlay do `?debug`.
   - Rodar sempre na mesma máquina e navegador: a renderização muda com SO, hardware e modo headless. [Playwright](https://playwright.dev/docs/test-snapshots)
6. Checagens numéricas da spec: cores amostradas em pontos fixos (`#171717`, `#CD9016`, `#FAFAF8`), espessura da parede perto de 13% da largura.

### Crítico

- Recebe: JPG de referência, screenshot, overlay, imagem de diff, números.
- Responde em formato fixo: `PASS` ou `FAIL` e no máximo 3 lacunas numeradas, a maior primeiro, cada uma com região da imagem.
- O construtor corrige **só a maior lacuna** por rodada (como no método).
- Lembrar o caso "untextured": o diagnóstico do crítico pode estar errado. O construtor pode contestar com evidência.

### Parada

- Para com sucesso: todos os gates passam e o crítico dá `PASS`.
- Teto: 6 rodadas por etapa. Para sem sucesso se o diff não melhorar em 2 rodadas seguidas.
- Guardar screenshot e diff de **toda** rodada e entregar a melhor, não a última.
- Por worker: `--print-timeout` (ex.: `20m`).
- Falhou no teto: o líder resume as lacunas e pede decisão humana, em vez de seguir gastando.

### Exemplo de chamada do construtor (rascunho, não testado)

```bash
agy -p "$(cat rodada-03.md)" \
  --model gemini-4-neon-high \
  --output-format json \
  --print-timeout 20m \
  --mode accept-edits
```

- Rodar com o diretório de trabalho na worktree do Orca. O `agy` não documenta flag de diretório de trabalho; há `--add-dir`.
- Preferir liberar só o necessário em `permissions.allow` a usar `--dangerously-skip-permissions`.
- Ler `status` no JSON: ação não aprovada é negada sem erro e o processo sai com 0.

## 8. Bônus: Antigravity CLI (`agy`) sem interação

Fonte: [Headless mode](https://antigravity.google/docs/cli/headless). Testado: `agy --help` e `agy models` na versão 1.5.15.

- `agy -p "prompt"` (ou `--print`, `--prompt`): roda um prompt e sai. Resposta no stdout, diagnóstico no stderr.
- Precisa de login prévio numa sessão interativa. Sem credencial, em CI, sai com `authentication required`.
- `--output-format text|json|stream-json`. O `json` traz `conversation_id`, `status`, `response`, `error`, `duration_seconds`, `num_turns`, `usage`.
- `--json-schema` força saída estruturada (útil para o veredito do crítico).
- `--input-format stream-json` mantém uma conversa aberta, uma mensagem por linha.
- **Modelo:** `--model <slug>`. Modelo desconhecido sai com erro, sem fallback. Listar com `agy models`.
- `--effort low|medium|high|xhigh|max`, conforme o modelo. `--agent <nome>`; listar com `agy agents`.
- Permissões: `--dangerously-skip-permissions` aprova tudo. Regras finas em `permissions.allow` de `~/.gemini/antigravity-cli/settings.json`, ex.: `command(git)`, `write_file(src/)`. Ação não aprovada é "soft-denied": a execução segue e sai com 0.
- `--sandbox` liga restrições de terminal. `--print-timeout` limita o tempo (padrão `0s`, sem limite).
- Status possíveis: `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, `RUNNING`.
- Testado: a 1.5.15 tem `--mode accept-edits|auto|plan`, `--add-dir` e `--settings`. A página de docs cita `--mode`, mas não o lista na referência.
- Testado: `agy models` lista, entre outros, `gemini-4-neon-*`, `gemini-4-carbon-*`, `gemini-4-argon-*`, `gemini-4-hydrogen-*`, `gemini-3.8-flash-*`, `claude-sonnet-4-6`, `claude-opus-4-6-thinking` e `gpt-oss-120b-medium`. A lista depende da conta.

## Não verificado

- Data e texto dos posts de Matt Shumer no X (X bloqueou o acesso).
- Custo, modelo e número de rodadas do Claude of Duty: não publicados.
- Crítica de Pieter Levels e o valor de US$ 500: só resumo secundário, post original não achado.
- Faixa de US$ 400 a 800 por projeto: só blog secundário.
- Se os subagentes de crítica do Claude Code ou do `agy` herdam o contexto do construtor: não verifiquei nas docs. Para garantir contexto limpo, criar o crítico como processo separado (`agy -p` novo ou subagente sem fork).
- Qualidade do Gemini como construtor de Three.js e qual slug usar: não testado. O exemplo usa `gemini-4-neon-high` sem comparação.
- Seção 7 inteira: proposta minha, sem execução. A meta de 2% no diff é um ponto de partida a calibrar.
- O comando de exemplo da seção 7 não foi executado.
