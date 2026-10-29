import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

const topicSchema = z.object({
	concept: z.string().optional(),
	related: z.array(z.string()).default([]),
	officialDocs: z.array(z.object({ title: z.string(), url: z.url() })).default([]),
	verified: z
		.object({
			date: z.coerce.date(),
			versions: z.record(z.string(), z.string()),
		})
		.optional(),
	planned: z.array(z.string()).default([]),
	quizFor: z.string().optional(),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: topicSchema }) }),
};
