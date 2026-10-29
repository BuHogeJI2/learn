import { getCollection, type CollectionEntry } from 'astro:content';
import { locales } from '../locales.mjs';

type Doc = CollectionEntry<'docs'>;

export interface TopicLink {
	title: string;
	description?: string;
	href: string;
}

const translatedLocales = Object.keys(locales).filter((key) => key !== 'root');

function localeOf(id: string) {
	return translatedLocales.find((locale) => id === locale || id.startsWith(`${locale}/`));
}

/** Strips the locale prefix, so `ru/architecture/caching` and `architecture/caching` share one id. */
function topicIdOf(id: string) {
	const locale = localeOf(id);
	if (!locale) return id;
	return id === locale ? 'index' : id.slice(locale.length + 1);
}

function assertTextOnly(translation: Doc) {
	const { concept, related, officialDocs, verified, quizFor } = translation.data;
	if (concept || quizFor || verified || related.length > 0 || officialDocs.length > 0) {
		throw new Error(
			`Translation "${translation.id}" sets structural frontmatter; keep it in the English file only`,
		);
	}
}

/**
 * Splits the docs collection into English source pages, which own the structure
 * (concept, related, officialDocs, verified, quizFor), and translations, which only add text.
 */
async function loadTopics() {
	const sources = new Map<string, Doc>();
	const translations = new Map<string, Doc>();
	for (const entry of await getCollection('docs')) {
		const locale = localeOf(entry.id);
		if (locale) {
			assertTextOnly(entry);
			translations.set(`${locale}:${topicIdOf(entry.id)}`, entry);
		} else {
			sources.set(entry.id, entry);
		}
	}

	return {
		sources,
		linkTo(source: Doc, locale: string | undefined): TopicLink {
			const translated = locale ? translations.get(`${locale}:${source.id}`) : undefined;
			const { title, description } = (translated ?? source).data;
			return { title, description, href: locale ? `/${locale}/${source.id}/` : `/${source.id}/` };
		},
	};
}

function isQuiz(entry: Doc) {
	return entry.data.quizFor !== undefined;
}

/** Collects the structure a page shows, localized for `locale`: concept, links, backlinks, quiz, docs and versions. */
export async function getTopicConnections(page: Doc, locale: string | undefined) {
	const { sources, linkTo } = await loadTopics();
	const topicId = topicIdOf(page.id);
	const source = sources.get(topicId);
	if (!source) return { related: [], linkedFrom: [], officialDocs: [] };

	const resolve = (id: string) => {
		const entry = sources.get(id);
		if (!entry) throw new Error(`Topic "${topicId}" links to unknown topic "${id}"`);
		return linkTo(entry, locale);
	};
	const { concept, related, quizFor, officialDocs, verified } = source.data;

	const alreadyShown = new Set([topicId, concept, ...related]);
	const linkedFrom = [...sources.values()].filter(
		(entry) =>
			!alreadyShown.has(entry.id) &&
			!isQuiz(entry) &&
			(entry.data.concept === topicId || entry.data.related.includes(topicId)),
	);
	const quiz = [...sources.values()].find((entry) => entry.data.quizFor === topicId);

	return {
		concept: concept ? resolve(concept) : undefined,
		related: related.map(resolve),
		linkedFrom: linkedFrom.map((entry) => linkTo(entry, locale)),
		quiz: quiz && linkTo(quiz, locale),
		quizTopic: quizFor ? resolve(quizFor) : undefined,
		officialDocs,
		verified,
	};
}

/** Lists written topics under a domain page, localized for `locale`, excluding quizzes and the domain page itself. */
export async function getDomainTopics(page: Doc, locale: string | undefined): Promise<TopicLink[]> {
	const { sources, linkTo } = await loadTopics();
	const domainId = topicIdOf(page.id);
	return [...sources.values()]
		.filter((entry) => entry.id.startsWith(`${domainId}/`) && !isQuiz(entry))
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((entry) => linkTo(entry, locale));
}
