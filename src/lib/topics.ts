import { getCollection, type CollectionEntry } from 'astro:content';

type Doc = CollectionEntry<'docs'>;

export interface TopicLink {
	title: string;
	description?: string;
	href: string;
}

function toLink(entry: Doc): TopicLink {
	return { title: entry.data.title, description: entry.data.description, href: `/${entry.id}/` };
}

async function getDocsById() {
	const docs = await getCollection('docs');
	return new Map(docs.map((entry) => [entry.id, entry]));
}

function resolve(docsById: Map<string, Doc>, id: string, referencedFrom: string): Doc {
	const entry = docsById.get(id);
	if (!entry) throw new Error(`Topic "${referencedFrom}" links to unknown topic "${id}"`);
	return entry;
}

function isQuiz(entry: Doc) {
	return entry.data.quizFor !== undefined;
}

/** Collects every cross-topic link a page shows: its concept, manual links, backlinks and quiz. */
export async function getTopicConnections(page: Doc) {
	const docsById = await getDocsById();
	const { concept, related = [], quizFor } = page.data;

	const conceptEntry = concept ? resolve(docsById, concept, page.id) : undefined;
	const relatedEntries = related.map((id) => resolve(docsById, id, page.id));
	const quizTopic = quizFor ? resolve(docsById, quizFor, page.id) : undefined;

	const alreadyShown = new Set([page.id, concept, ...related]);
	const linkedFrom = [...docsById.values()].filter(
		(entry) =>
			!alreadyShown.has(entry.id) &&
			!isQuiz(entry) &&
			(entry.data.concept === page.id || entry.data.related?.includes(page.id)),
	);
	const quiz = [...docsById.values()].find((entry) => entry.data.quizFor === page.id);

	return {
		concept: conceptEntry && toLink(conceptEntry),
		related: relatedEntries.map(toLink),
		linkedFrom: linkedFrom.map(toLink),
		quiz: quiz && toLink(quiz),
		quizTopic: quizTopic && toLink(quizTopic),
	};
}

/** Lists written topics under a domain page, excluding quizzes and the domain page itself. */
export async function getDomainTopics(domainId: string): Promise<TopicLink[]> {
	const docsById = await getDocsById();
	return [...docsById.values()]
		.filter((entry) => entry.id.startsWith(`${domainId}/`) && !isQuiz(entry))
		.sort((a, b) => a.id.localeCompare(b.id))
		.map(toLink);
}
