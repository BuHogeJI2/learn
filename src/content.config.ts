import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

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

const uiStrings = z.object({
	'topic.partOf': z.string(),
	'topic.quizFor': z.string(),
	'topic.checkedAgainst': z.string(),
	'topic.quizPrompt': z.string(),
	'topic.quizButton': z.string(),
	'topic.officialDocs': z.string(),
	'topic.related': z.string(),
	'topic.linkedFrom': z.string(),
	'topic.notWrittenYet': z.string(),
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: topicSchema }) }),
	i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema({ extend: uiStrings }) }),
};
