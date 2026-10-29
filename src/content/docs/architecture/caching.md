---
title: Caching
description: Where a result can be stored between the database and the screen, and how to keep it fresh.
officialDocs:
  - title: MDN — HTTP caching
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching
  - title: MDN — Cache-Control header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
  - title: web.dev — Prevent unnecessary network requests with the HTTP Cache
    url: https://web.dev/articles/http-cache
  - title: RFC 9111 — HTTP Caching
    url: https://www.rfc-editor.org/rfc/rfc9111
  - title: RFC 5861 — stale-while-revalidate and stale-if-error
    url: https://www.rfc-editor.org/rfc/rfc5861
---

## What problem it solves

A request travels a long way: browser → network → CDN (a network of servers placed close to users that keep copies of your content) → application server → database, and back. Every step costs time, and the steps at the end (rendering, queries) also cost money and capacity.

A cache keeps a copy of a result **closer to where it is needed**, so repeated work is skipped. It gives you two things:

- **Speed**: the user gets the answer from a closer, faster place.
- **Protection of the origin** (the server that holds the original data): the server and the database do less work, so the system survives more traffic for less money.

The price is always the same: **the copy can be out of date**, and you now have to decide when to throw it away. Most caching bugs are about this decision.

## Mental model: four questions for every cache

Every cache, from a browser to Redis (an in-memory key-value store), is described by the same four questions. If you can answer them, you understand the cache.

| Question | Meaning | Examples |
| --- | --- | --- |
| **Key** | What identifies an entry? Two requests with the same key get the same answer. | URL + `Vary` headers; function arguments; GraphQL query + variables |
| **Scope** | Who shares the entry? | One user (browser), everyone (CDN, server cache) |
| **Freshness** | How long is the entry good without checking? | `max-age=60`, TTL (time to live) in Redis, `cacheLife('hours')` |
| **Invalidation** | How do you remove or refresh it early? | Purge by URL, purge by tag, new file name |

**Scope is the dangerous one.** A personal response (a cart, a user name) stored in a shared cache will be shown to other users. This is a common real incident, not a theory.

## The layers

```
 Browser (one user)              Edge (shared)        Your servers (shared)        Data
┌──────────────────────────┐    ┌─────────────┐     ┌──────────────────────────┐   ┌──────────┐
│ 1. App memory            │    │ 4. CDN      │     │ 5. Application cache     │   │ 6. DB    │
│    (Apollo, TanStack     │───►│    cache    │────►│    (in-process LRU,      │──►│  buffers,│
│    Query, router cache)  │    │             │     │    Redis, framework      │   │  views   │
│ 2. HTTP cache            │    │             │     │    data cache)           │   │          │
│ 3. Service Worker cache  │    └─────────────┘     └──────────────────────────┘   └──────────┘
└──────────────────────────┘
```

| Layer | Scope | Controlled by | Typical content |
| --- | --- | --- | --- |
| 1. App memory | One tab | Your JS code / client library | API responses, normalized entities |
| 2. Browser HTTP cache | One user | `Cache-Control`, `ETag` response headers | JS/CSS/images, some API responses |
| 3. Service Worker (a script the browser runs between the page and the network) | One user | Your service worker code | Offline pages, app shell |
| 4. CDN / edge (servers at the edge of the network, near users) | All users | Headers (`s-maxage`), CDN rules, purge API | Static files, public HTML and API responses |
| 5. Application cache | All users (per instance or shared) | Your server code | Query results, rendered fragments, sessions |
| 6. Database | All users | The DB itself, materialized views | Hot pages in memory, precomputed results |

The closer a layer is to the user, the faster it is and the harder it is to invalidate. You can purge a CDN or Redis, but you **cannot** reach into a user's browser and delete an entry. That is why browser caching relies on time and on file names, not on purges.

## HTTP caching: the shared language

Layers 2 and 4 are controlled by HTTP headers, and most frameworks translate their own settings into these headers. So it is worth knowing the main ones.

**`Cache-Control` directives:**

- `max-age=N`: fresh for N seconds in any cache.
- `s-maxage=N`: same, but only for shared caches (CDN). It lets the browser and the CDN have different lifetimes.
- `no-cache`: you may store it, but you must check with the server before every use. The name is misleading: it does **not** mean "don't cache".
- `no-store`: don't store it anywhere. Use for sensitive data.
- `private`: only the browser may store it, never a CDN. Use for personalized responses.
- `public`: shared caches may store it, even when they normally wouldn't (for example, a response to a request with an `Authorization` header).
- `stale-while-revalidate=N`: after expiry, serve the old copy for up to N more seconds while fetching a new one in the background.
- `immutable`: this content will never change at this URL; don't even revalidate.

**Revalidation.** When a stored copy is stale, the cache doesn't have to download everything again. It asks: "I have version X, is it still current?" using `If-None-Match` (with an `ETag`) or `If-Modified-Since`. If nothing changed, the server answers `304 Not Modified` with no body. This saves bandwidth, but not the round trip.

**`Vary`** adds request headers to the cache key. `Vary: Accept-Language` stores a separate copy per language. `Vary: Cookie` usually kills the hit rate (the share of requests answered from the cache), because every user has different cookies.

**A classic setup for a web app:**

- Hashed static files (`app.3f9a1c.js`): `max-age=31536000, immutable`. When the content changes, the file name changes, so it never needs invalidation.
- HTML: `no-cache` (always revalidate), or a short `s-maxage` with `stale-while-revalidate` at the CDN. HTML points to the hashed files, so a fresh HTML file means fresh code.

## Freshness strategies

1. **Time-based (TTL).** An entry expires after N seconds. It is simple and predictable, but you accept up to N seconds of stale data, and you pay for refreshes even when nothing changed.
2. **Stale-while-revalidate.** After expiry, the cache answers with the old copy immediately and refreshes in the background. Users almost never wait, but someone sees slightly old data once.
3. **Event-based invalidation.** When data changes, you explicitly purge the related entries: by key, by URL or by **tag** (for example, every entry tagged `product:42`). The data is fresh almost immediately, but you must know which entries depend on which data. Tags make this manageable.
4. **Versioned keys.** Never invalidate; change the key instead (a hash in the file name, a version number in the key). This is the most reliable method, but it only works where you control the reference to the key.

In practice you combine them: a long TTL as a safety net plus event-based invalidation on change. For example, CMS content is cached "forever" with tags, and a publish webhook purges the tag.

**Patterns for server-side caches:**

- **Cache-aside** (the most common): the app checks the cache; on a miss it reads the DB and writes the result to the cache.
- **Write-through**: every write goes to the cache and the DB together, so reads are always warm.
- **Write-behind**: writes go to the cache first and reach the DB later. This is fast but can lose data, so it is rare in web apps.

## Typical failures

- **Private data in a shared cache.** A personalized response without `private` or `no-store` gets cached by a CDN. The fix: mark personalized responses explicitly, and keep public and personal data in separate requests.
- **Cache stampede (thundering herd).** A popular entry expires, and thousands of requests miss at the same moment and hit the database together. Fixes: stale-while-revalidate, request coalescing (only one request refreshes, the others wait), random jitter on TTLs, or refreshing on events instead of on time.
- **Low hit rate.** Keys are too specific, so entries are rarely reused. Typical causes: tracking parameters (`?utm_source=…`) in the URL, `Vary: Cookie`, timestamps in keys. Normalize keys and measure the hit rate before trusting a cache.
- **Stacked staleness.** Browser, CDN and server caches each have their own TTL, so in the worst case the data is as old as all of them together. To debug, check the response headers: `Age` (seconds the copy has been in a shared cache) and the CDN status header (`x-vercel-cache`, `cf-cache-status`, `x-cache`) tell you which layer answered.
- **Cold cache after deploy.** Many caches are tied to a deployment or to process memory. After a deploy or restart, the first requests are slow and the origin gets a spike of load.

## When to cache and when not to

Caching pays off when data is:

- **Read much more often than written**,
- **Expensive** to compute or fetch,
- **Shared** by many users,
- **Tolerant to staleness** for some time.

Avoid caching (or keep it per-user and short) when:

- The data **must be exactly current**: balances, stock at checkout, permissions.
- It is **cheap and personal**: the cache adds complexity and gives almost nothing back.
- It is **rarely reused**: the hit rate will be near zero.

A good order of thinking: first make the response cacheable by HTTP (free and standard), then add a CDN, and only then add application-level caches where measurements show a need.

## Landscape

- **Browser:** the HTTP cache (built in), the Cache API with Service Workers, client data libraries (Apollo Client, TanStack Query, SWR, RTK Query).
- **CDN / edge:** Cloudflare, Fastly, Akamai, Amazon CloudFront, the Vercel and Netlify edge networks.
- **Reverse proxies:** Varnish, Nginx `proxy_cache`.
- **Application caches:** Redis and Valkey, Memcached, in-process LRU caches (they drop the least recently used entries first); framework caches such as the [Next.js `use cache` directive](/tools/nextjs/caching/).
- **Database level:** buffer pools (automatic), materialized views, read replicas. A replica is not a cache, but it solves a similar "too many reads" problem.
