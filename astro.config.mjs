// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	integrations: [
		starlight({
			title: 'Learn Book',
			customCss: ['./src/styles/custom.css'],
			components: {
				PageTitle: './src/components/PageTitle.astro',
				MarkdownContent: './src/components/MarkdownContent.astro',
			},
			sidebar: [
				{ label: 'Web platform', items: [{ autogenerate: { directory: 'web-platform' } }] },
				{ label: 'Security', items: [{ autogenerate: { directory: 'security' } }] },
				{ label: 'Architecture', items: [{ autogenerate: { directory: 'architecture' } }] },
				{ label: 'Data', items: [{ autogenerate: { directory: 'data' } }] },
				{ label: 'Observability', items: [{ autogenerate: { directory: 'observability' } }] },
				{ label: 'Delivery', items: [{ autogenerate: { directory: 'delivery' } }] },
				{
					label: 'Tools',
					items: [
						{ label: 'Overview', slug: 'tools' },
						{ label: 'React', items: [{ autogenerate: { directory: 'tools/react' } }] },
						{ label: 'Next.js', items: [{ autogenerate: { directory: 'tools/nextjs' } }] },
						{ label: 'Apollo GraphQL', items: [{ autogenerate: { directory: 'tools/apollo' } }] },
					],
				},
			],
		}),
	],
});
