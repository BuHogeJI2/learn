---
title: Next.js caching — check yourself
description: Scenario questions about 'use cache', invalidation after a change, where entries live, and version defaults.
quizFor: tools/nextjs/caching
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off. The scenarios assume Next.js 16 with Cache Components enabled, unless they say otherwise.

## 1. "I saved it, but I still see the old name"

A profile page reads the user's display name through a `'use cache'` function tagged `user:42`. The "Save" form calls a Server Action (a server function the form calls directly) that updates the database and then `revalidateTag('user:42', 'max')`, and redirects back to the profile. The user sees the old name right after saving; a reload a moment later shows the new one. Why, and what should the action call?

<details>
<summary>Answer</summary>

`revalidateTag(tag, 'max')` is **[stale-while-revalidate](/architecture/caching/#freshness-strategies)**: the next request still gets the old entry while a fresh one is generated in the background. Good for a blog post or a catalog, wrong for the person who just made the change.

In a Server Action, call **`updateTag('user:42')`**: it expires the entry immediately, so the redirected page waits for fresh data and the user sees their own change ([read-your-own-writes](/data/consistency/#copies-and-consistency-models)). Keep `revalidateTag` for changes that come from elsewhere, such as a [CMS](/data/cms/) webhook in a Route Handler (an API endpoint inside the `app` directory), where `updateTag` isn't available.

</details>

## 2. `cookies()` inside a cached function

A developer adds `'use cache'` to `getRecommendations()`, which calls `cookies()` to read the user's region. The build fails with an error about request data inside a cached function. What are the options?

<details>
<summary>Answer</summary>

`'use cache'` entries are **shared by all users**, so they can't read request data such as `cookies()` or `headers()`, including in helpers they call.

Options:

- **Read the cookie outside** the cached function and pass the region as an **argument**: it becomes part of the cache key, so all users of one region share one entry. Usually the best choice when the value has few variants.
- **`'use cache: private'`**: it may read cookies and headers directly, but its results live only in that user's browser, not in a shared server cache.
- No caching: read it at request time inside a [`<Suspense>`](/tools/react/suspense/) boundary, so it streams after the static shell.

</details>

## 3. A cache that never hits

On a [serverless](/delivery/deployment-models/#deployment-models) platform (instances started per request and stopped soon after), a slow product query wrapped in `'use cache'` with a dynamic product ID seems to run on almost every request. Logs show cache misses most of the time. Why, and what can you do?

<details>
<summary>Answer</summary>

Entries computed at request time are stored by default **in memory, per instance**. On serverless platforms instances are short-lived and many run in parallel, so an entry made by one instance is rarely there for the next request.

Options:

- **`'use cache: remote'`**: a shared, durable cache handler (for example Redis or a platform KV). Entries survive across instances, at the cost of a network round trip per lookup and platform fees, so it pays off only when the hit rate is high.
- **Prerender** what you can: known product IDs from `generateStaticParams` become part of the static output, and a lifetime that isn't too short lets entries join the static shell (the prerendered part of the page served instantly).
- Make the query itself cheaper (an index, less data).

Remember that every deploy starts with a cold cache: the build ID is part of every key.

</details>

## 4. Publishing from a CMS

Product pages show data from a headless CMS (one that serves content only through an API) through `'use cache'` functions with `cacheLife('days')`. Editors want a published change to appear within a minute. How do you connect the CMS to the cache?

<details>
<summary>Answer</summary>

Tag each cached function with the entries it shows (`cacheTag('product:42')`, plus tags for shared things such as `category:lamps`). Have the CMS call a **publish webhook** (an HTTP request the CMS sends when something is published): a Route Handler that verifies the webhook signature and calls `revalidateTag(tag, { expire: 0 })` for the changed entry's tags. `updateTag` isn't available outside Server Actions, and the recommended `'max'` profile would serve the old page once more while it regenerates; with `{ expire: 0 }` the next request waits for fresh data. Pages regenerate as they are visited, and the long lifetime keeps everything else cached.

The minute must also hold in the browser and when the webhook fails:

- **Browsers** keep cached results for the profile's `stale` time, 5 minutes for `days` (minimum 30 seconds), so a visitor who already has the page open can see the old version that long. If that matters, use a custom profile with a shorter `stale`.
- **A lost webhook** leaves the old data until the `days` profile refreshes it: up to a day. Log and alert on failed deliveries, and run a reconciliation job (one that regularly asks the CMS what was published recently and revalidates those tags) every minute; or accept that the minute is a goal, not a guarantee, when something fails ([CMS publishing](/data/cms/#drafts-preview-and-publishing)). For editors' previews of drafts, use **Draft Mode** (a mode, enabled by a cookie for editors, that renders unpublished content), which bypasses all `'use cache'` entries.

</details>

## 5. The upgrade that tripled the database load

An older app without Cache Components is upgraded from Next.js 14 to 15. Nothing in the code changed, but database and API load roughly triples and some pages get slower. What changed?

<details>
<summary>Answer</summary>

The **defaults** of the previous caching model changed in Next.js 15: `fetch` requests and `GET` Route Handlers are **no longer cached by default**, and the client router no longer reuses page segments on ordinary link navigation (Back and Forward still do). The app had relied on Next.js 14 caching these implicitly, so every render now calls the API again.

Short term: opt the right requests back into caching (for example `cache: 'force-cache'` on `fetch`, or segment options), deliberately, per data source. Longer term: move to Cache Components, where async data is cached only when you opt in with `'use cache'`, and an explicit `cacheLife` makes its lifetime clear, so caching is visible in the code instead of a version default.

</details>
