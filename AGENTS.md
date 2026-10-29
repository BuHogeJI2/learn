# Learn Book

A personal book about how the web and software systems work. It is built with
Astro Starlight and deployed to Vercel. The reader is a frontend developer who
wants high-level knowledge: what options exist, how things work inside, and why
to choose one over another. Not syntax, not "how to write the code".

## Structure

Content lives in `src/content/docs/`:

- Domain folders (`web-platform`, `security`, `architecture`, `data`,
  `observability`, `delivery`) hold **concept pages**.
- `tools/<tool>/` holds **tool pages**.
- `quizzes/` mirrors topic paths and holds one quiz per topic. It is not in the
  sidebar; a topic shows a "Check yourself" button when a quiz exists for it.
- Each folder has an `index.mdx` overview. Its `planned` frontmatter lists
  topics that are not written yet.
- `inbox.md` at the repo root collects new gaps that have no place yet.

A topic id is its path without the extension, e.g. `architecture/caching`.

## Frontmatter

| Field | Used on | Meaning |
| --- | --- | --- |
| `concept` | tool pages | id of the concept page this tool implements; shown as "Part of" |
| `related` | any topic | ids of related topics; backlinks are added automatically |
| `officialDocs` | any topic | `{ title, url }` links to original documentation |
| `verified` | tool pages | `{ date, versions: { <package>: <version> } }` |
| `planned` | overview pages | titles of topics not written yet |
| `quizFor` | quiz pages | id of the topic the quiz checks |

The build fails if `concept`, `related` or `quizFor` points to a topic that
does not exist. Link only to written topics.

## Writing a concept page

Sections, in this order:

1. What problem it solves
2. Mental model: how it works inside
3. Options and trade-offs (named after the topic, e.g. "Freshness strategies")
4. Typical failures
5. When to use it, when not to
6. Landscape: which tools and services implement it

Write about global knowledge, not about one team's stack. Use tables and
ASCII diagrams where they make the model clearer.

## Terms and inline links

The first time a page mentions a concept the reader may not know, explain it
in a short phrase in brackets: "CDN (a network of servers placed close to
users that keep copies of your content)". This applies to every page type.

If that concept has its own written topic, also link the first mention to it,
with a section anchor when one fits: `[stale-while-revalidate](/architecture/caching/#freshness-strategies)`.
Use absolute paths; Russian pages link with the `/ru/` prefix. Never link to a
topic that is not written yet; `npm run build` checks every internal link and
anchor and fails on a broken one.

## Writing a tool page

- Always set `concept` and `verified`. Check the latest stable version on npm
  and read the current official docs before writing; never rely on memory for
  API names or defaults.
- Keep it short: how the tool answers the concept's questions, where its data
  lives, surprises, and how it maps back to the general concept.
- Don't repeat the concept page; link to it.

## Writing a quiz

- Scenario questions only: choosing a tool or approach, explaining why,
  debugging a symptom. Never "what does this code print".
- The answer goes in `<details><summary>Answer</summary>…</details>`, with
  blank lines around the Markdown inside it.
- A good answer names the trade-off, not only the choice.

## When a topic is written

- Remove it from the `planned` list of its overview page.
- Search all existing pages, in both languages, for mentions of the new
  topic, and link the first mention on each page.
- Add `related` links in both directions where it helps navigation.
- Check every `officialDocs` URL responds.

## Language

The reader's first language is not English. Use common words and short
sentences, without simplifying the content.

## Russian version

English is the source. Russian pages live in `src/content/docs/ru/` and mirror
the English paths. A page without a translation shows the English text with a
notice, so links never break.

- A Russian file has text frontmatter only: `title`, `description`, `planned`,
  `sidebar`. Structure (`concept`, `related`, `officialDocs`, `verified`,
  `quizFor`) stays in the English file; the build fails if a translation sets it.
- Every change to an English page updates its Russian page in the same change.
- UI strings of the custom components live in `src/content/i18n/{en,ru}.json`.
  Sidebar group labels are translated in `astro.config.mjs`.

### How to translate

- Translate faithfully: same sections, same claims, same strength of each
  recommendation, same uncertainty. Add nothing, drop nothing, don't rewrite
  as an explanation.
- Code, commands, identifiers, HTTP headers, file names, API names and error
  text stay exactly as they are.
- Use "вы" for the reader.
- Follow the glossary. A term marked "English" stays in English; the first
  time it appears on a page, add its Russian meaning in brackets:
  "hit rate (доля попаданий в кэш)". Later uses on the page need no brackets.
- A term not in the glossary: keep it in English if Russian developers usually
  say it in English, otherwise use the common Russian word. Add the decision
  to the glossary.

### Glossary

| English | Russian | Rule |
| --- | --- | --- |
| cache, caching | кэш, кэширование | Russian |
| cache key | ключ кэша | Russian |
| invalidation | инвалидация | Russian |
| request, response | запрос, ответ | Russian |
| header | заголовок | Russian |
| server, browser, database | сервер, браузер, база данных | Russian |
| layer | слой | Russian |
| build, deploy | сборка, деплой | Russian |
| framework | фреймворк | Russian |
| freshness | свежесть | Russian |
| scope | scope (кто видит данные) | English |
| CDN, edge, origin | CDN, edge, origin | English |
| TTL, hit rate | TTL, hit rate | English |
| stale-while-revalidate | stale-while-revalidate | English |
| purge | purge | English |
| cache stampede, thundering herd | cache stampede, thundering herd | English |
| cache-aside, write-through, write-behind | same | English |
| request coalescing, jitter | same | English |
| serverless | serverless | English |
| fallback | fallback | English |
| static shell, Partial Prerendering | same | English |
| Server Components, Server Actions, Route Handlers, Draft Mode | same | English |
| read-your-own-writes | read-your-own-writes | English |
| Observability, Delivery (domain names) | Мониторинг, Поставка ПО | Russian; translate every domain name that is not a tool name |
| status code | статус-код | Russian |
| safe, idempotent (method) | безопасный, идемпотентный | Russian |
| endpoint | эндпоинт | Russian |
| contract, schema | контракт, схема | Russian |
| hydration, streaming | гидратация, стриминг | Russian |
| source of truth | источник истины | Russian |
| optimistic update | оптимистичное обновление | Russian |
| main thread | главный поток (main thread) | Russian |
| round trip, RTT, TTFB | same | English |
| handshake | handshake | English |
| waterfall, preload scanner, layout shift | same | English |
| islands, resumability | same | English |
| over-fetching, under-fetching | same | English |
| breaking change | breaking change | English |
| idempotency key | idempotency key | English |
| race condition | race condition | English |
| reverse proxy, PoP, anycast | same | English |
| origin shield, request collapsing | same | English |
| DDoS, WAF, rate limiting | same | English |

## Development

```
npm run dev     # local server
npm run build   # also validates frontmatter and cross-topic links
```

Run the dev server in the background with `astro dev --background`; manage it
with `astro dev stop`, `astro dev status` and `astro dev logs`.
