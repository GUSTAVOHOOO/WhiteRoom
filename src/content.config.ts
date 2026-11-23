import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Cada projeto é um arquivo .md em src/content/projetos (os que começam com _ são ignorados)
const projetos = defineCollection({
	loader: glob({ pattern: '**/[^_]*.md', base: './src/content/projetos' }),
	schema: ({ image }) =>
		z.object({
			titulo: z.string(),
			resumo: z.string(),
			capa: image(),
			capaAlt: z.string(),
			link: z.url().optional(),
			ordem: z.number().default(0),
		}),
});

export const collections = { projetos };
