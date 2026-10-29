---
title: Next.js caching (Cache Components)
description: How Next.js 16 decides what is prerendered, what is cached and what streams per request.
concept: architecture/caching
verified:
  date: 2026-10-29
  versions:
    next: 16.4.3
officialDocs:
  - title: Caching (getting started)
    url: https://nextjs.org/docs/app/getting-started/caching
  - title: Revalidating
    url: https://nextjs.org/docs/app/getting-started/revalidating
  - title: use cache directive
    url: https://nextjs.org/docs/app/api-reference/directives/use-cache
  - title: cacheLife
    url: https://nextjs.org/docs/app/api-reference/functions/cacheLife
  - title: cacheComponents config
    url: https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents
  - title: use cache - remote
    url: https://nextjs.org/docs/app/api-reference/directives/use-cache-remote
  - title: use cache - private
    url: https://nextjs.org/docs/app/api-reference/directives/use-cache-private
  - title: Caching without Cache Components (previous model)
    url: https://nextjs.org/docs/app/guides/caching-without-cache-components
---

## The model in short

With **Cache Components** (`cacheComponents: true`, on by default in new apps), **nothing is cached unless you ask for it**. You opt in with the `'use cache'` directive.

At build time, Next.js renders each route and sorts every part of the tree into one of three kinds:

- **Static**: pure code, imports, synchronous reads. These are prerendered automatically.
- **Cached**: async work marked with `'use cache'`. It is prerendered too, as long as its lifetime isn't too short.
- **Request-time**: uncached fetches, `cookies()`, `headers()`, `searchParams`, unknown `params`. These **must** sit inside `<Suspense>`. Their fallback goes into the prerendered page and the real content streams in per request.

Static and cached parts form the **static shell**, which a CDN can serve instantly. This is **Partial Prerendering (PPR)**: one page, partly static, partly streamed.

The **previous model** (Next.js 13–15, still used when the flag is off) cached a lot implicitly: `fetch` results and whole routes, controlled by route segment options like `dynamic` and `revalidate`. It was hard to predict. The new model is explicit.

## The four cache questions, answered by Next.js

| Question | Next.js answer |
| --- | --- |
| **Key** | Build ID + function ID + serialized arguments + values captured from the outer scope. Arguments and return values must be serializable. |
| **Scope** | `'use cache'` is shared by all users. `'use cache: private'` may read cookies and headers; its results live only in the user's browser. |
| **Freshness** | `cacheLife(profile)` with three numbers: `stale` (the client uses it without asking), `revalidate` (the server refreshes in the background), `expire` (after this, requests wait for fresh data). |
| **Invalidation** | `cacheTag('x')` on the entry, then `revalidateTag('x', 'max')`, `updateTag('x')` or `revalidatePath('/path')` after a change. |

Built-in `cacheLife` profiles: `seconds`, `minutes`, `hours`, `days`, `weeks`, `max`. Without an explicit `cacheLife`, the `default` profile applies: stale 5 min, revalidate 15 min, never expires. The docs recommend always setting `cacheLife` explicitly.

**`revalidateTag` vs `updateTag`:**

- `revalidateTag(tag, 'max')` is **stale-while-revalidate**: the next visitor still gets the old data while the new data is generated. Use it for catalogs and blog posts. It works in Server Actions and Route Handlers.
- `updateTag(tag)` **expires the entry immediately**, so the user who made the change sees it right away ("read your own writes"). It works only in Server Actions.

## Where cached results live

1. **Prerendered HTML**: on disk or in the platform's storage behind a CDN. This is the static shell, rebuilt according to `revalidate` and `expire`.
2. **Server store**: by default **in memory, per instance**. On serverless, instances are short-lived, so runtime entries are often lost between requests. `'use cache: remote'` moves entries to a shared, durable cache handler (for example Redis or a platform KV), at the cost of a network round trip and platform fees.
3. **Browser**: the client router keeps results for their `stale` time, with a minimum of 30 seconds.

All three are scoped to **one deployment**: the build ID is part of the key, so every deploy starts with a cold cache.

## Things that surprise people

- **You can't read `cookies()` or `headers()` inside `'use cache'`.** Read them outside, then pass the value as an argument; it becomes part of the key. This also applies to helpers called from inside the cached function.
- **Short lifetimes are not prerendered.** The `seconds` profile, `revalidate: 0`, or `expire` under 5 minutes make the entry a request-time hole instead of part of the static shell.
- **`Math.random()`, `Date.now()` and `crypto.randomUUID()` need a decision.** Either call `await connection()` first and wrap the component in `<Suspense>` (a new value per request), or put it in `'use cache'` (one shared value).
- **`<Suspense>` alone doesn't make something dynamic.** It only provides the fallback. What makes a part request-time is the data it reads.
- **Bots get a fully dynamic render.** Some crawlers need complete metadata in `<head>`, so Next.js detects them and skips the static shell.
- **Draft Mode bypasses all `'use cache'` entries.** This is how CMS previews see unpublished content.

## How this maps to plain HTTP caching

- The static shell is like a CDN-cached HTML page with `stale-while-revalidate`.
- `cacheLife` with `stale`, `revalidate` and `expire` is like `max-age` plus `stale-while-revalidate` plus a hard limit.
- Tags are the same idea as tag-based CDN purging (Fastly surrogate keys, Cloudflare cache tags).
- `'use cache: private'` is like `Cache-Control: private`: only the user's browser keeps it.
