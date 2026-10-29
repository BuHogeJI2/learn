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
- Add `related` links in both directions where it helps navigation.
- Check every `officialDocs` URL responds.

## Language

The reader's first language is not English. Use common words and short
sentences, without simplifying the content.

## Development

```
npm run dev     # local server
npm run build   # also validates frontmatter and cross-topic links
```

Run the dev server in the background with `astro dev --background`; manage it
with `astro dev stop`, `astro dev status` and `astro dev logs`.
