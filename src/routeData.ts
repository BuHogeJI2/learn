import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { getTitleByHref } from './lib/topics';

// Pagination reuses sidebar labels, and every overview page is labeled "Overview" there.
export const onRequest = defineRouteMiddleware(async (context) => {
	const { pagination, locale } = context.locals.starlightRoute;
	for (const link of [pagination.prev, pagination.next]) {
		if (link) link.label = (await getTitleByHref(link.href, locale)) ?? link.label;
	}
});
