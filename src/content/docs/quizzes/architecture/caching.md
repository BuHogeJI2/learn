---
title: Caching — check yourself
description: Scenario questions about choosing and debugging caches.
quizFor: architecture/caching
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. One page, three kinds of data

An online shop's product page shows a product description (edited a few times a year), a price (changes every few minutes) and the user's cart (personal). How do you cache each part?

<details>
<summary>Answer</summary>

Split the page by **freshness** (how stale it may be) and **scope** (who may see it), two of the [four cache questions](/architecture/caching/#mental-model-four-questions-for-every-cache):

- **Description**: shared, rarely changes. Cache for a long time at the [CDN](/web-platform/cdn/) (servers near users that keep copies) or server level and invalidate on edit (a tag like `product:42` purged by a webhook, an HTTP callback that the [CMS](/data/cms/), the editors' content system, or the admin panel sends on publish).
- **Price**: shared, changes often. Use a short TTL (how long a cached copy lives) with stale-while-revalidate (serve the old copy while a fresh one is fetched in the background), or a separate small request with its own short lifetime. Don't let the price dictate the lifetime of the whole page.
- **Cart**: personal. Never put it in a shared cache. Fetch it per user (`Cache-Control: private` or `no-store`), or keep it in client state.

The key idea: if you cache them as one response, the strictest part (the cart) forces the whole page to be uncacheable.

</details>

## 2. Users still run the old app

You deployed a fix, but hours later some users still have the old bug. Hard refresh fixes it. Why does this happen, and how do you prevent it for good?

<details>
<summary>Answer</summary>

The browser (or the CDN) still has an old copy and doesn't ask the server. Common causes: JS files without a content hash served with a long `max-age`, or HTML cached for a long time, so it keeps pointing to the old bundles.

The standard fix:

- Static files get a **content hash** in the name and `max-age=31536000, immutable`. A new build means new names, so they never need invalidation.
- HTML gets `no-cache` (revalidate every time, which is cheap with `ETag` and `304`) or a short `s-maxage` at the CDN.

You cannot purge a user's browser cache, so you must design for this beforehand.

</details>

## 3. Another user's name in the header

After you put a CDN in front of the API, a user reports seeing someone else's name. What happened, and how do you prevent it?

<details>
<summary>Answer</summary>

A **personalized response was stored in a shared cache**. The CDN cached the response for the first user and served it to everyone with the same cache key (URL).

Prevention:

- Mark personalized responses `Cache-Control: private` or `no-store`.
- Separate public data (cacheable) from personal data (separate requests).
- Configure the CDN to bypass the cache when a [session cookie](/security/auth/#sessions-in-practice-the-lifecycle) or `Authorization` header is present, and don't let it ignore `private`.

It is a **scope** mistake: the data was correct but went to the wrong audience. Treat it as a security incident, not only a bug.

</details>

## 4. Database spikes every hour

A popular page is cached for one hour. Every hour, at the moment the entry expires, database CPU jumps and some requests fail. What is this, and what are your options?

<details>
<summary>Answer</summary>

It is a **cache stampede** (thundering herd): when the entry expires, all concurrent requests miss at once and go to the database together.

Options, often combined:

- **Stale-while-revalidate**: keep serving the old copy while one background request refreshes it.
- **Request coalescing / locking**: only the first miss rebuilds the entry; the others wait for it or get the stale copy.
- **Jitter**: add randomness to TTLs so that many entries don't expire at the same second.
- **Refresh on events** instead of on time: rebuild the entry when the data actually changes.

</details>

## 5. "Fast, but published content must appear within a minute"

Content comes from a [CMS](/data/cms/). Editors want changes live within a minute after publishing. The site must be fast. What strategy do you choose?

<details>
<summary>Answer</summary>

Two workable strategies, with different behavior when something fails:

- **Long-lived caching plus event-based invalidation**: cache content for a long time (with tags), and have the CMS call a **publish webhook** that purges the affected tags. When the webhook works, fresh content appears within seconds and unchanged content is never refetched. But webhooks can be lost, so the minute holds only with retries, alerts on failed deliveries and a reconciliation job that runs every minute (it compares what was published recently with what was purged, and purges what is missing). If all of that fails, the cache lifetime sets the worst case.
- **A short time-based lifetime that fits the budget**: for example `s-maxage=30, stale-while-revalidate=30` at the CDN, so no visitor gets a copy older than about a minute (after the stale window, the CDN must wait for a fresh copy). Simple, and it heals itself: an entry is refreshed only when it is requested after it went stale, not all at once. The cost: more requests to the origin.

Many sites combine them: event-based invalidation for speed, and a bounded lifetime as the guarantee. Count every layer: browser, CDN and server caches each add their own lifetime, so "within a minute" must hold for their sum.

</details>

## 6. Which layer answered?

A user sees data that is 20 minutes old, but your server cache TTL is only 5 minutes. How do you find out where the stale copy comes from?

<details>
<summary>Answer</summary>

The layers stack: browser, CDN and server caches each have their own lifetime, so the worst-case age can be their sum.

To find the source, look at the response headers in the [Network tab](/web-platform/page-loading/#reading-the-network-tab):

- `Age`: how long the copy has been in a shared cache.
- The CDN status header (`x-vercel-cache`, `cf-cache-status`, `x-cache`): `HIT` means the CDN answered.
- `(disk cache)` / `(memory cache)` in the Size column means the browser didn't make a request at all.
- `Cache-Control` on the response: check that `max-age` (browser) and `s-maxage` (CDN) are what you expect.

When purging, go from the inside out: server cache first, then the CDN. Otherwise the CDN may refill itself from the stale server copy.

</details>
