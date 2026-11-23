# Pesquisa de dependências

Data: 2026-11-23. Fontes: npm registry (`npm view`), documentação oficial, changelogs e repositórios de origem.
"Testado" indica um experimento em diretório temporário no Windows 11, Node 26.7.0 e npm 11, com espaços no caminho.

## Versões recomendadas

| Pacote | Versão | Tipo | Motivo |
|---|---|---|---|
| `astro` | 7.4.13 | dependency | Última estável; traz Vite 8, Zod 4, Sätteri e sharp |
| `tailwindcss` | 4.3.5 | dependency | Tailwind 4 |
| `@tailwindcss/vite` | 4.3.5 | dependency | Plugin oficial; manter igual a `tailwindcss` |
| `three` | 0.187.0 | dependency | r187, última release |
| `gsap` | 3.15.1 | dependency | Última estável (a 4.0 ainda é beta); inclui todos os plugins |
| `@astrojs/sitemap` | 3.7.6 | dependency (opcional) | Só se quiser sitemap; exige `site` no config |
| `@astrojs/check` | 0.9.12 | devDependency | Verificação de tipos em `.astro` |
| `typescript` | **6.0.3** | devDependency | O 7.0.2 (`latest`) não funciona com `astro check` |
| `@types/three` | 0.187.0 | devDependency | Igual a `three` |
| `wrangler` | 4.166.0 | devDependency (no deploy) | Só quando for publicar na Cloudflare |

**Não instalar:** `vite` e `sharp` (vêm com o Astro no npm), `@astrojs/markdown-remark`, `@astrojs/tailwind` (Tailwind 3), `@astrojs/cloudflare` (só para SSR).

Testado com este conjunto, sem o `wrangler`: `npm install` sem conflito de peers, `npm audit` com 0 vulnerabilidades, `astro check` com 0 erros, `astro build` e `astro dev` funcionando (Tailwind, Fonts API, coleção Markdown com `image()`, sharp, Three e GSAP).

Versões e peers: [astro](https://www.npmjs.com/package/astro), [@astrojs/check](https://www.npmjs.com/package/@astrojs/check), [typescript](https://www.npmjs.com/package/typescript), [@tailwindcss/vite](https://www.npmjs.com/package/@tailwindcss/vite), [three](https://www.npmjs.com/package/three), [gsap](https://www.npmjs.com/package/gsap), [wrangler](https://www.npmjs.com/package/wrangler).

## 1. Node 26 e Markdown

- **Node 26 é permitido.** A exigência é `v22.23.4` ou superior, e só versões ímpares não têm suporte. [Instalação](https://docs.astro.build/en/install-and-setup/#prerequisites)
- Node 26 é LTS desde 2026-10-28. [Calendário](https://github.com/nodejs/Release/blob/main/schedule.json)
- **A 26.7.0 instalada está atrasada.** A atual é 26.13.1 (2026-11-10). As releases 26.12.1 e 26.13.1 estão marcadas como de segurança. Atualizar. [Índice de releases](https://nodejs.org/dist/index.json)
- `@astrojs/markdown-remark` é peer **opcional** (`peerDependenciesMeta.optional: true`). [npm](https://www.npmjs.com/package/astro)
- Não é necessário para coleções Markdown: o processador padrão é o **Sätteri**, com GFM e SmartyPants. O remark só é preciso para plugins remark/rehype. [Guia v7](https://docs.astro.build/en/guides/upgrade-to/v7/#new-default-markdown-processor-sätteri)
- Testado: a coleção Markdown renderiza sem o pacote.

## 2. TypeScript

- Fixar **6.0.3**. O peer de `@astrojs/check` 0.9.12 é `^5.0.0 || ^6.0.0`. [npm](https://www.npmjs.com/package/@astrojs/check)
- Testado com 7.0.2: `npm install` falha com ERESOLVE. Forçando, `astro check` sai com código 1 e "does not currently support TypeScript 7.0".
- A Microsoft confirma que projetos Astro devem ficar no 6.0 por enquanto. [Anúncio do TS 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- Futuro: TS 7.1+ (hoje beta) com `@astrojs/ts-content-mapper` 0.2.0, experimental. A mensagem do próprio `astro check` diz que ele será descontinuado. [README](https://github.com/withastro/astro/tree/main/packages/language-tools/ts-content-mapper#usage), [issue 17268](https://github.com/withastro/astro/issues/17268)
- `astro build` não verifica tipos. Usar `astro check && astro build`. [TypeScript](https://docs.astro.build/en/guides/typescript/)

## 3. Vite e Tailwind

- Astro 7.4.13 depende de `vite ^8.3.8`. [npm](https://www.npmjs.com/package/astro), [Guia v7](https://docs.astro.build/en/guides/upgrade-to/v7/#vite-8)
- Caminho oficial: `npx astro add tailwind`, que instala o plugin Vite. [Astro](https://docs.astro.build/en/guides/styling/#tailwind), [Tailwind](https://tailwindcss.com/docs/installation/framework-guides/astro)

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ vite: { plugins: [tailwindcss()] } });
```

`src/styles/global.css` contém `@import "tailwindcss";` e é importado no layout.

## 4. Content Collections

Arquivo: `src/content.config.ts`. [Guia](https://docs.astro.build/en/guides/content-collections/), [imagens](https://docs.astro.build/en/guides/images/)

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const projetos = defineCollection({
  loader: glob({ base: './src/content/projetos', pattern: '**/*.md' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    capa: image(),
    url: z.url(),
    fotos: z.array(z.object({ src: image(), alt: z.string() })).default([]),
  }),
});
export const collections = { projetos };
```

Renderizar: `import { getCollection, render } from 'astro:content'` e `const { Content } = await render(entry)`.

- `z` vem de `astro/zod`. Importar de `astro:content` ou `astro:schema` está obsoleto. [Guia v6](https://docs.astro.build/en/guides/upgrade-to/v6/#deprecated-astroschema-and-z-from-astrocontent)
- É Zod 4: `z.url()` e `z.email()` no lugar de `z.string().url()`; `error` no lugar de `message`. [Guia v6](https://docs.astro.build/en/guides/upgrade-to/v6/#zod-4)
- `image().refine()` não é suportado, e a ordem de `getCollection()` não é determinística (ordenar no código). [Guia](https://docs.astro.build/en/guides/content-collections/)
- Removidos na v6: coleções legadas, `Astro.glob()`, `<ViewTransitions />` e config CommonJS. [Guia v6](https://docs.astro.build/en/guides/upgrade-to/v6/#removed)

Mudanças da v7 que afetam projeto novo ([guia v7](https://docs.astro.build/en/guides/upgrade-to/v7/)):

- `compressHTML: 'jsx'` é o padrão: quebra de linha entre elementos inline **não vira espaço**. Usar `{" "}`.
- Compilador Rust: tag não fechada é erro, e HTML inválido não é corrigido.
- `src/fetch.ts` é nome reservado.
- `@astrojs/db` foi removido, assim como constantes internas de `astro:transitions`.

## 5. Fontes e View Transitions

- A Fonts API é estável desde a v6 (opção `fonts` no topo do config). [Guia v6](https://docs.astro.build/en/guides/upgrade-to/v6/#experimental-flags), [fontes](https://docs.astro.build/en/guides/fonts/)

```js
import { defineConfig, fontProviders } from 'astro/config';
export default defineConfig({
  fonts: [{
    provider: fontProviders.fontsource(), // ou .google(), .local()
    name: 'Inter', cssVariable: '--font-inter',
    weights: ['100 900'], styles: ['normal'], subsets: ['latin'],
  }],
});
```

- No `<head>`: `import { Font } from 'astro:assets'` e `<Font cssVariable="--font-inter" preload />`. No CSS: `@theme inline { --font-sans: var(--font-inter); }`. As fontes são baixadas e servidas pelo próprio site. [Fontes](https://docs.astro.build/en/guides/fonts/)

`<ClientRouter />` (de `astro:transitions`), conforme o [guia](https://docs.astro.build/en/guides/view-transitions/):

- Scripts de módulo executam **uma vez só**. Inicializar em `astro:page-load`, que dispara na primeira carga e a cada navegação.
- Scripts inline podem reexecutar; para forçar, `is:inline data-astro-rerun`.
- `transition:persist` mantém o elemento, mas reinicia animações CSS e recarrega iframes.
- Com `prefers-reduced-motion`, o ClientRouter desativa as **próprias** animações. GSAP e Three precisam de tratamento à parte.
- **Bug aberto:** rolagem animada por `scrollTo()` quadro a quadro (o que pode afetar smooth scroll em JS) faz links internos pararem por cerca de 10 s no Safari 26.2+. [Issue 18761](https://github.com/withastro/astro/issues/18761)
- Alternativa sem JS e sem mudar o comportamento dos scripts: view transitions nativas entre documentos. [Guia](https://docs.astro.build/en/guides/view-transitions/#differences-between-browser-native-view-transitions-and-astros-clientrouter-)

## 6. Three.js r187

- `WebGLRenderer` usa só WebGL 2; WebGL 1 saiu na r163. [Fonte](https://github.com/mrdoob/three.js/blob/r187/src/renderers/WebGLRenderer.js)
- Addons vêm no pacote, em `three/addons/*`; versões devem coincidir com `three`. [Instalação](https://threejs.org/manual/#installation), [package.json](https://github.com/mrdoob/three.js/blob/r187/package.json)

| Uso | Import |
|---|---|
| Contorno grosso de arestas | `LineSegments2` de `three/addons/lines/LineSegments2.js` |
| Geometria do contorno | `LineSegmentsGeometry` de `three/addons/lines/LineSegmentsGeometry.js` |
| Linha contínua | `Line2` e `LineGeometry` de `three/addons/lines/Line2.js` e `LineGeometry.js` |
| Material | `LineMaterial` de `three/addons/lines/LineMaterial.js` |
| Contorno de silhueta | `OutlineEffect` de `three/addons/effects/OutlineEffect.js` |
| Cor chapada, extrusão, arestas | `MeshBasicMaterial`, `ExtrudeGeometry`, `Shape`, `EdgesGeometry` de `three` |

- `LineBasicMaterial.linewidth` é ignorado no WebGL (sempre 1 px), por isso o `LineMaterial`. [Docs](https://threejs.org/docs/pages/LineBasicMaterial.html)
- `LineMaterial.linewidth` é em **px CSS** (ou unidades de mundo com `worldUnits: true`). `resolution` é atualizado sozinho por `LineSegments2.onBeforeRender`. [Docs](https://threejs.org/docs/pages/LineMaterial.html)
- `EdgesGeometry` usa limiar padrão de 1 grau; em curvas extrudadas, subir (ex.: 30) evita linhas em cada segmento. [Fonte](https://github.com/mrdoob/three.js/blob/r187/src/geometries/EdgesGeometry.js)
- Limpeza: geometrias, materiais e texturas exigem `dispose()`; o renderer também. [Cleanup](https://threejs.org/manual/#cleanup), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- `sideEffects` está declarado no pacote, e não encontrei guia oficial de tree-shaking. Medido no Vite 8, minificado: cena mínima 525 kB (129 kB gzip); com linhas e extrusão 583 kB (146 kB gzip). GSAP + ScrollTrigger + SplitText: 121 kB (47 kB gzip).
- Como o piso é alto, carregar a splash por `import()` dinâmico. O Vite avisa acima de 500 kB.

## 7. GSAP

- Uso comercial gratuito, incluindo plugins antes pagos (SplitText, MorphSVG). Restrição: não usar em ferramenta visual de animação sem código que concorra com a Webflow, nem remover avisos de copyright. [Licença](https://gsap.com/community/standard-license/) (modificada em 2025-05-30)
- Não é open source: é licença proprietária "no charge", e a Webflow pode revisá-la. O HTML da página ainda traz, **comentado**, o texto antigo sobre plano Business; não é a licença vigente.
- O pacote 3.15.1 contém ScrollTrigger, SplitText, Flip, MorphSVG, DrawSVG, ScrollSmoother, Draggable e outros (verificado em `node_modules/gsap`). Import: `import { ScrollTrigger } from 'gsap/ScrollTrigger'`.
- Chamar `gsap.registerPlugin()` para o tree-shaking não remover o plugin. [Instalação](https://gsap.com/docs/v3/Installation/)
- `gsap.matchMedia()` reverte sozinho animações e ScrollTriggers quando a query deixa de casar e aceita `(prefers-reduced-motion: reduce)`. [Docs](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/)
- `gsap.context(...).revert()` faz o mesmo sem media query. Listeners manuais devem ser removidos na função de limpeza. [Docs](https://gsap.com/docs/v3/GSAP/gsap.context()/)
- Com ClientRouter (combinação inferida; só compilação e tipos testados, não o comportamento no navegador): criar em `astro:page-load` e chamar `mm.revert()` em `astro:before-swap`.

## 8. sharp

- `sharp ^0.35.4` é **optionalDependency** do Astro e o serviço de imagem padrão. Com npm vem junto; com pnpm pode ser preciso instalar. [npm](https://www.npmjs.com/package/astro), [imagens](https://docs.astro.build/en/guides/images/#default-image-service)
- Testado no Windows: `@img/sharp-win32-x64@0.35.5` instalado e WebP gerado.
- Se usar `--omit=optional`, o sharp não vem.
- Aberto: alguns PNGs fora de especificação falham no 0.35 com `libpng read error`. Solução: reexportar o PNG. [Issue 4644](https://github.com/lovell/sharp/issues/4644)

## 9. Deploy

- **Usar Workers com static assets.** A Cloudflare diz "Start new projects with Workers". [Pages](https://developers.cloudflare.com/pages/), [Astro](https://docs.astro.build/en/guides/deploy/cloudflare/)
- Site estático **não precisa de adapter**, só de `wrangler.jsonc`:

```jsonc
{
  "name": "whiteroom",
  "compatibility_date": "AAAA-MM-DD",
  "assets": { "directory": "./dist", "not_found_handling": "404-page" }
}
```

- Deploy: `npx astro build && npx wrangler deploy`. Sem config, o Wrangler detecta o Astro e gera configuração com `main` apontando para um Worker; por isso criar o arquivo antes. [Cloudflare + Astro](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- Requisições a assets são gratuitas e ilimitadas. [Cobrança](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- Limites do plano grátis: 20.000 arquivos por versão e 25 MiB por arquivo. [Limites](https://developers.cloudflare.com/workers/platform/limits/#static-assets)
- Workers não responde a `Range` em assets: atenção a vídeo no Safari. [Limitações](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- Workers Builds usa Node 24.22.1 por padrão. Para 26, definir `NODE_VERSION` ou `.nvmrc`. [Imagem de build](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- Uso comercial no plano grátis da Cloudflare: os termos **não contêm proibição** a uso comercial; permitem aceite em nome de empresa e vedam coletar dados de cartão em serviços gratuitos. [Termos](https://www.cloudflare.com/terms/) (2025-09-12), [termos da plataforma](https://www.cloudflare.com/service-specific-terms-developer-platform/)
- **Vercel Hobby não serve:** "only [...] for your personal or non-commercial use". [Termos, seção 4](https://vercel.com/legal/terms) (2026-10-19)

## 10. Espaços no caminho e Node 26

- Testado em caminho com dois trechos com espaço (`Windows 11` e `sp ace`): install, check, build e dev (incluindo `/_image`) funcionam com rolldown, oxide, lightningcss, compilador Rust e sharp.
- Buscas nos repositórios do Astro, Vite, Tailwind e rolldown só acharam issues **fechadas** sobre espaços (ex.: [astro 13332](https://github.com/withastro/astro/issues/13332), [astro 5598](https://github.com/withastro/astro/issues/5598)).
- Windows + Node 25/26: `astro build` podia falhar com `ERR_INVALID_ARG_VALUE` ao limpar `dist`. Corrigido na **7.3.6**; não fixar versão anterior. [Issue 18170](https://github.com/withastro/astro/issues/18170), [changelog](https://github.com/withastro/astro/blob/main/packages/astro/CHANGELOG.md)
- Aberto: oxide 4.3.5 pode dar segfault com vários `Scanner` no mesmo processo (relatado em Linux com Node 26, via Vitest). Não ocorreu aqui. [Issue 20707](https://github.com/tailwindlabs/tailwindcss/issues/20707)
- Extensão Astro do VS Code 2.17.4 vinha sem o binário do Windows (fechado em 2026-11-17). Manter atualizada. [Issue 18728](https://github.com/withastro/astro/issues/18728)
- No Windows, `astro dev` fica em primeiro plano quando detecta agente de IA; `--background` é manual. [CLI](https://docs.astro.build/en/reference/cli-reference/#--background)

## 11. Telemetria

- Por usuário: `npx astro telemetry disable`. Em CI: `ASTRO_TELEMETRY_DISABLED`. [CLI](https://docs.astro.build/en/reference/cli-reference/#astro-telemetry), [página](https://astro.build/telemetry/)

## Não verificado

- Autorização **expressa** de uso comercial no plano grátis da Cloudflare: só a ausência de proibição foi constatada, por busca de termos nos dois documentos. Não é parecer jurídico.
- Definição detalhada de "uso comercial" da Vercel: não está mais na página de fair use; só a cláusula dos termos foi confirmada.
- Deploy real na Cloudflare e build no Workers Builds com Node 26 (não executados).
- Comportamento visual de Three, GSAP e ClientRouter no navegador (só compilação, tipos e tamanho de bundle).
- `astro check`/`build` em Node 26.13.1 (testado só em 26.7.0).
- Resend (formulário de contato) e ilhas React: fora do escopo.
- As buscas de issues foram por palavra-chave; não garantem cobertura total. A de "node 26" no repositório do sharp foi superficial.
