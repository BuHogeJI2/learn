---
title: CDN — check yourself
description: Scenario questions about edge compute, hit rate, origin protection and personalization.
quizFor: web-platform/cdn
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. The edge made it slower

The team moved a product page handler from a server in us-east to an edge function (code that runs in the CDN's servers near users) "to be closer to users". For users in Tokyo the page got slower. The handler makes three queries, one after another, to a database in us-east. What happened?

<details>
<summary>Answer</summary>

The function is now close to the **user** but far from the **data**. Before, Tokyo paid one long round trip (the time for a request to go there and back) to us-east, and the three queries ran next to the database. Now each of the three queries crosses the Pacific: three long round trips instead of one.

Rule: run code near the data it talks to most. Options: move the handler back to the database region (the CDN still terminates connections near the user, so it stays fast), combine the queries into one, or read from a replica (a read-only copy of the data) close to the edge. Keep edge functions for work that needs no data from the origin (your own server): redirects, A/B group assignment, header changes, a first check of a signed token.

</details>

## 2. A CDN that answers almost nothing

You put a CDN in front of a marketing site. The dashboard shows a hit rate (the share of requests the CDN answers from its cache) of 5%, and the origin load didn't drop. The responses are cacheable, and the CDN logs show many different URLs for the same few pages: emails and ads add `?utm_source=...&utm_campaign=...&utm_content=...`, with a different value for every campaign and recipient. What is wrong?

<details>
<summary>Answer</summary>

The **[cache key](/architecture/caching/#mental-model-four-questions-for-every-cache)** (what the CDN uses to decide whether two requests are "the same") includes the full query string. With so many unique combinations, most visits arrive with a key nobody used before, so they miss. Cookies or headers in the key (for example a `Vary: Cookie`) have the same effect. If the URLs were few, look for other causes first: `Cache-Control: private` or `no-store`, a `Set-Cookie` on every response, or a bypass rule.

Fixes: remove tracking parameters from the cache key (most CDNs let you ignore or allowlist query parameters), keep cookies out of the key for public pages, and avoid `Vary` on headers with many values. Check the result with the cache status header (`x-cache`, `cf-cache-status`) and `Age`. The trade-off: if a parameter really changes the content, ignoring it serves the wrong page, so allowlist the ones that matter rather than blindly dropping all.

</details>

## 3. The DDoS went around the CDN

Your site is behind a CDN with protection against DDoS (flooding a site with traffic from many machines), yet an attack takes the origin down. Logs show the traffic doesn't come from CDN addresses. How did it happen, and how do you prevent it?

<details>
<summary>Answer</summary>

The origin is **publicly reachable**. Attackers found its address (old DNS records, certificate logs, a subdomain that isn't behind the CDN) and sent traffic straight to it. The CDN protects only the traffic that goes through it.

Make the origin accept traffic **only from the CDN**: allow only the CDN's IP ranges, require a secret header that the CDN adds, or use an authenticated connection (mutual TLS, or a tunnel offered by the CDN). After that, change the origin's IP if it has leaked.

</details>

## 4. "Our API is personal, a CDN is useless"

Every API response is personal, so nothing can be cached. A teammate says a CDN gives you nothing. Do you agree?

<details>
<summary>Answer</summary>

Not fully. Even with zero caching, a CDN:

- **terminates TCP and TLS near the user** and reuses warm connections to the origin, which removes several long round trips from each new connection;
- gives **HTTP/2, HTTP/3 and modern TLS** for free;
- adds **protection**: DDoS absorption, WAF rules (a web application firewall that blocks malicious requests, see [what a CDN does](/web-platform/cdn/#what-a-cdn-does-besides-caching)), [rate limiting](/architecture/reliability/#protecting-a-service-from-overload).

It matters less for an internal tool used from the same region as the origin. And there is a cost: you must make sure personal responses are marked `private` or `no-store`, so the CDN never stores them.

</details>

## 5. Personalization at the edge

Product wants the home page to greet each logged-in user by name, and the page is cached at the CDN. A developer proposes to add the user-id cookie to the cache key. What happens, and what would you do instead?

<details>
<summary>Answer</summary>

With the user id in the key, every user gets their own cache entry. Entries are no longer shared: each user's first visit is a miss, and only their own repeat visits within the cache lifetime can hit, so most of the benefit of caching this page is gone. And if the key setup is ever wrong, one user's page can reach another user.

Better: keep the page **public** and cached, and load the personal part (the greeting, the cart) in a separate, uncached request, or render it on the client. Use edge personalization only for a **few** variants (country, A/B group, logged in or not), because each variant splits the cache.

</details>
