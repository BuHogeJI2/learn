---
title: CMS — check yourself
description: Scenario questions about choosing a CMS, content modeling, preview and publishing.
quizFor: data/cms
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Do we need a CMS?

A developer-tools startup has a marketing site of 20 pages and a documentation section. Only developers edit them, a few times a month. Someone proposes a hosted headless CMS. What would you choose?

<details>
<summary>Answer</summary>

Probably **Markdown or MDX files in the repository**. Only developers edit, changes are rare, and Git already gives history, review and rollback for free. A static build is simple, fast and costs nothing extra.

A CMS pays off when non-technical people edit often, need preview, approvals, scheduling or several languages. Revisit the choice when marketing wants to change pages without a developer; a file-based CMS with an editor UI (TinaCMS, Keystatic, Decap) is a gentle middle step that keeps content in Git.

</details>

## 2. A content model that doesn't survive a redesign

The current CMS has a "Homepage" type with fields `heroTitle`, `heroText2`, `leftColumnPromo` and `bottomBannerImage`. A redesign is coming, and the new home page has a different layout. What is the problem with this model, and how would you model it instead?

<details>
<summary>Answer</summary>

The model is **copied from the current design**. Its fields describe positions on one page, so the redesign means remodeling and migrating everything, and the same content can't be reused elsewhere (the app, emails, other pages).

Model by **meaning**: "Product", "Promotion", "Article", "Testimonial", with references between them. A page then selects or references these entries, often through a small set of **blocks** (hero, grid, call to action) that developers own. The trade-off: editors get a little less direct control over "what goes in the left column", in exchange for content that outlives the layout.

</details>

## 3. A product launch leaked early

A secret product page existed only as a draft in the CMS. A day before launch, it appears in a search result and in a screenshot on social media. Preview works through a URL with `?preview=true`. What went wrong, and how should preview work?

<details>
<summary>Answer</summary>

Likely several things: a preview controlled by a **public URL parameter** anyone can add, preview responses **cached publicly** (a CDN stored the draft page and served it), and preview pages **indexed** because a link to them escaped.

Preview should be a mode only **authorized editors** can enter (for example Next.js Draft Mode, which sets a cookie after the server checks a secret), with the CMS preview token kept on the server. Preview responses skip all caches and are marked `private, no-store` and `noindex`. The cost is some setup per framework; the alternative is leaking unreleased work.

</details>

## 4. The new author name shows only on some pages

An editor fixes a typo in an author's name and publishes. The author's page and their articles update within seconds, but the home page, the article lists and the search results page still show the old name for hours. Why?

<details>
<summary>Answer</summary>

The site **invalidated only the changed entry's own pages**. But the author appears on every page that **references** the entry: lists, the home page, cards in other articles. Those pages are still served from a long cache.

Tag cached pages and data with **every entry they show** (for example `author:7`, `article:42`), and have the publish webhook purge the tags of the changed entry, for publishing, unpublishing and deleting. Search results come from a separate index, so the index must be updated too. The trade-off: more tags per page means more pages refreshed per publish, which is fine compared with stale content.

</details>

## 5. Published, but nothing changed

The site caches pages for a day and relies on the CMS publish webhook to refresh them. One morning, editors publish an urgent correction and it never appears; a developer finds that the webhook calls failed during a short outage of the site's API. How do you make publishing reliable?

<details>
<summary>Answer</summary>

Webhooks are **not guaranteed**: providers retry only a few times, may deliver out of order, and a failure during an outage can be lost. With a one-day cache, a lost webhook means up to a day of stale content.

Layers of defense:

- **Log and alert** on failed deliveries, and give editors a way to re-trigger a refresh.
- Make the handler **[idempotent](/architecture/reliability/#idempotency-making-again-safe)** and verify the webhook signature, so retries are safe and nobody else can trigger it.
- Add a **reconciliation** job that periodically asks the CMS what changed and refreshes those tags.
- Choose a **maximum cache lifetime** that matches how long stale content is acceptable when everything else fails. A day may be too long for urgent corrections; an hour with stale-while-revalidate costs little.

</details>
