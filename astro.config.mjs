// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import { locales } from './src/locales.mjs';

/**
 * @param {string} label
 * @param {string} ru
 * @param {string} directory
 */
function domain(label, ru, directory) {
	return { label, translations: { ru }, items: [{ autogenerate: { directory } }] };
}

export default defineConfig({
	integrations: [
		starlight({
			title: 'Learn Book',
			plugins: [
				// A Russian page may link to a topic that is not translated yet; it shows the English fallback.
				starlightLinksValidator({ errorOnFallbackPages: false, errorOnInconsistentLocale: true }),
			],
			defaultLocale: 'root',
			locales,
			customCss: ['./src/styles/custom.css'],
			routeMiddleware: './src/routeData.ts',
			components: {
				PageTitle: './src/components/PageTitle.astro',
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				domain('Web platform', 'Веб-платформа', 'web-platform'),
				domain('Security', 'Безопасность', 'security'),
				domain('Architecture', 'Архитектура', 'architecture'),
				domain('Data', 'Данные', 'data'),
				domain('Observability', 'Observability', 'observability'),
				domain('Delivery', 'Delivery', 'delivery'),
				{
					label: 'Tools',
					translations: { ru: 'Инструменты' },
					items: [
						{ label: 'Overview', translations: { ru: 'Обзор' }, slug: 'tools' },
						domain('React', 'React', 'tools/react'),
						domain('Next.js', 'Next.js', 'tools/nextjs'),
						domain('Apollo GraphQL', 'Apollo GraphQL', 'tools/apollo'),
					],
				},
			],
		}),
	],
});
