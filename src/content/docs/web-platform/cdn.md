---
title: CDN and the edge
description: What a CDN does besides caching, how requests reach it, and when running code at the edge helps or hurts.
related:
  - architecture/caching
  - web-platform/http
  - web-platform/page-loading
officialDocs:
  - title: MDN — CDN (glossary)
    url: https://developer.mozilla.org/en-US/docs/Glossary/CDN
  - title: web.dev — Content delivery networks (CDNs)
    url: https://web.dev/articles/content-delivery-networks
  - title: Cloudflare — How Workers works
    url: https://developers.cloudflare.com/workers/reference/how-workers-works/
---

## What problem it solves

Physics sets a hard limit. Light in optical fiber travels about 200,000 km per second, so a round trip (the time for a request to reach the server and come back) from Europe to the US west coast takes about 150 ms, before any server does any work. Loading a page needs several round trips ([DNS](/web-platform/dns/), connection, TLS, the request itself), so distance multiplies.

One **origin** (the server that holds your application and original data) is far from most of your users. It is also a single point of load and a single target for attacks.

A **CDN** (content delivery network) is a large set of servers spread around the world. These locations are called **PoPs** (points of presence). The CDN sits between your users and your origin.

## Mental model: a reverse proxy in front of everything

```
User in Berlin ──► PoP Frankfurt ─┐
                                  ├──(shield PoP)──(warm connections)──► Origin in us-east
User in Tokyo  ──► PoP Tokyo ─────┘
```

A CDN is a **reverse proxy**: it receives requests for *your* domain and decides, for each one, whether to:

- **answer itself**: from its cache, with a redirect, from an edge function, or with a block;
- **forward it to the origin** and pass the response back, possibly storing a copy.

Users never talk to the origin directly. Ideally, the origin accepts traffic **only** from the CDN.

**How users reach the nearest PoP:**

- **DNS-based**: your domain points to the CDN (often by a `CNAME` record), and the CDN's DNS returns the IP of a PoP near the user.
- **Anycast**: the same IP address is announced from every PoP, and internet routing delivers each user's packets to the nearest one.

## What a CDN does besides caching

1. **Caching** public content close to users. Keys, lifetimes and purging (forced removal of cached copies) are explained in [Caching](/architecture/caching/).
2. **Terminating connections near the user.** The TCP and TLS handshakes happen with a PoP a few milliseconds away, and the PoP reuses long-lived, already-open connections to the origin. This speeds up even requests that **can't be cached**, such as API calls and personal pages.
3. **Modern protocols for free.** The CDN speaks HTTP/2, HTTP/3, TLS 1.3 and Brotli compression to users, even if your origin doesn't. See [HTTP versions](/web-platform/http/#http-versions-same-meaning-different-transport).
4. **Origin shielding and tiered caching.** Instead of every PoP asking the origin on a cache miss, PoPs ask a regional **shield** PoP first. If many users request the same missing file at once, the CDN sends one request to the origin and shares the answer (**request collapsing**).
5. **Routing.** Rules send `/api/*` to API servers and everything else to static storage, apply redirects and rewrites, split traffic for A/B tests, and switch to a backup origin if the main one fails.
6. **Protection.** A CDN absorbs **DDoS** attacks (Distributed Denial of Service: flooding a site with traffic from many machines) thanks to its sheer capacity, and offers a **WAF** (web application firewall: rules that block malicious requests), bot detection and [rate limiting](/architecture/reliability/#protecting-a-service-from-overload).
7. **Edge compute**: running your own code in the PoPs (below).
8. **Image optimization**: resizing and converting images to modern formats on the fly.

## Edge compute: where should code run?

Code can run in three kinds of places:

| Place | Close to | Typical runtime |
| --- | --- | --- |
| **Origin region** | Your database | Full Node.js, [containers](/delivery/containers/), [serverless functions](/delivery/deployment-models/) (started on demand, with no server running all the time) in one region |
| **Edge** (every PoP) | The user | Lightweight isolates: start in milliseconds, limited APIs, short CPU time |
| **Several regions** | Users and regional data replicas | Same as origin, deployed multiple times |

The trade-off: the edge is close to the **user** but usually far from the **data**. If an edge function in Tokyo makes three sequential queries to a database in us-east, that is three long round trips. It is slower than running the same code next to the database and sending one response to Tokyo.

**Rule: run code near the data it talks to most.**

The edge is good for work that needs **no origin data, or only data that is replicated to the edge**:

- redirects and rewrites;
- a first check of a self-contained signed token, such as a [JWT](/security/auth/#mental-model-a-credential-checked-on-every-request) (JSON Web Token): its signature, expiry and required claims need no database. Whether the session was revoked, or what the user may do right now, still needs current data;
- assigning A/B test groups and geo-based variants;
- adding or changing headers;
- serving responses from an edge key-value store.

## Public and personal responses

Everything a CDN caches is **shared**. A personal response stored in the CDN cache will be served to other users. Mark personal responses so they are never stored there (`Cache-Control: private` or `no-store`), and keep public and personal data in separate requests. See [scope](/architecture/caching/#mental-model-four-questions-for-every-cache).

The edge can personalize cheaply by choosing between a few cached variants per request (by country, by A/B group, by a cookie). But each variant splits the cache, so many variants mean fewer hits.

## Typical failures

- **The origin is publicly reachable.** Attackers go around the CDN and its protection. Accept traffic only from the CDN (by IP list, a secret header or an authenticated connection).
- **Personal responses cached** because a response with `Set-Cookie` or user data wasn't marked private.
- **A low hit rate** (the share of requests the cache answers). Query parameters, cookies or headers in the cache key make every request unique, and the origin gets the full load anyway.
- **Edge functions with many database calls.** They are slower than the origin, not faster.
- **Expecting instant purges everywhere.** A purge takes seconds to reach all PoPs, and it never reaches browser caches.
- **The wrong client IP.** The origin sees the CDN's address. The real one is in a header (`X-Forwarded-For`, `CF-Connecting-IP`), and you can trust it only when the request really came from your CDN.
- **Debugging blind.** Check the cache status headers (`x-cache`, `cf-cache-status`, `x-vercel-cache`) and `Age` to see whether the CDN or the origin answered.
- **The CDN as a single point of failure.** When a big CDN has an outage, every site behind it goes down. Very large sites use more than one CDN.

## When to use it

- **Public websites: almost always**, at least for static files. Hosting platforms such as Vercel, Netlify and Cloudflare Pages include a CDN by default.
- **APIs and personal pages:** still useful for connection speed, modern protocols and protection, even with nothing cached.
- **Less value:** internal tools used from one office or region, where users are already close to the origin.
- **Edge compute:** when the logic is latency-sensitive and needs no data from the origin, or only replicated data.

## Landscape

- **CDNs:** Cloudflare, Fastly, Akamai, Amazon CloudFront, Google Cloud CDN, Azure Front Door, Bunny.
- **Hosting platforms with a built-in edge network:** Vercel, Netlify, Cloudflare Pages, Deno Deploy.
- **Edge compute:** Cloudflare Workers, Fastly Compute, CloudFront Functions and Lambda@Edge, Netlify Edge Functions, Vercel Routing Middleware.
- **Data at the edge:** Cloudflare KV, D1 and Durable Objects, Turso, Upstash Redis with global replicas. They differ in where the data really lives: KV copies data to many locations for reads, a D1 database has one primary location (plus optional read replicas), and each Durable Object lives in one place. An API you can call from the edge doesn't mean the data is next to every user.
