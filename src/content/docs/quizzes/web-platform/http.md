---
title: HTTP and HTTPS — check yourself
description: Scenario questions about methods, status codes, redirects, cookies and HTTP versions.
quizFor: web-platform/http
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Items disappear on their own

An admin panel sends a daily email with a link for each flagged item: `GET /items/42/delete`. Items start to disappear even though nobody clicked anything. What is going on, and how do you fix it?

<details>
<summary>Answer</summary>

`GET` promises to be **safe**: it should not change anything on the server. The rest of the web trusts that promise. Email scanners, link previews, browser prefetching and crawlers open links on their own, and each visit deleted an item.

The fix is to make the action match the method: the link opens a confirmation page, and the deletion itself is a `POST` or `DELETE` request sent by a button. The method is not a security control, so the server still checks that the user is allowed to delete.

</details>

## 2. A timeout after "Place order"

The client sends `POST /orders`. The request times out, and the client automatically retries it. Some customers now get two orders. What retry policy should the client have?

<details>
<summary>Answer</summary>

A timeout doesn't tell you whether the server did the work. The first request may have created the order, and only the response was lost. `POST` is not **idempotent** (sending it twice may have a different effect than sending it once), so a blind retry can repeat the effect.

Options:

- Retry automatically only idempotent requests (`GET`, `PUT`, `DELETE`).
- For `POST`, send an **[idempotency key](/architecture/api-styles/#error-boundaries)**: a unique id per user action. The server stores the result for that key and returns it again on a retry instead of creating a second order.
- Retry with a growing delay and a limit, and respect `Retry-After` on `429` and `503`.

The trade-off: the key needs storage and a little logic on the server, but it is a common, reliable way to make an action like order creation safe to retry.

</details>

## 3. "The CDN is broken"

After a release, users see `502 Bad Gateway` and `504 Gateway Timeout` pages served by your [CDN](/web-platform/cdn/) (a network of servers near users that sits in front of your own server). The team starts to change the CDN settings. Is that the right place to look?

<details>
<summary>Answer</summary>

Probably not. `502` and `504` come from **something in the middle** (a CDN, a [load balancer](/architecture/scaling/#load-balancing), a proxy) that could not get a good answer from the server behind it. `502` means the upstream response was invalid or the connection failed; `504` means it took too long.

Look upstream first: did the new release crash, start slowly, listen on a different port, or become slow on some endpoint? Check the logs and health of the origin (your own server behind the CDN), and compare the proxy timeout with the slowest request. The CDN is only the messenger in most cases.

</details>

## 4. A redirect you can't take back

During a migration you redirected `/blog/*` to `/articles/*` with `301`. The migration was cancelled and you removed the redirect, but many users still land on `/articles`. Why, and what should you have done?

<details>
<summary>Answer</summary>

`301` and `308` are **permanent**: browsers (and CDNs) cache them, sometimes for a very long time, and don't ask the server again. Removing the rule on the server doesn't reach those browsers.

For a move that may change, use a temporary redirect: `302`, or `307` when the method and body must be kept. Use `301`/`308` only when you are sure.

Now, don't simply redirect `/articles/*` back to `/blog/*`: browsers that cached the old redirect would bounce between the two URLs forever (a redirect loop). Instead, serve the same content at `/articles/*` too (or route those requests internally to the blog pages) until the cached redirects have expired, and purge the CDN cache.

</details>

## 5. Keep domain sharding?

A site moved to HTTP/2. A developer wants to keep serving images from `static1.example.com` and `static2.example.com` "to load more files in parallel". Is it a good idea?

<details>
<summary>Answer</summary>

No. Domain sharding (spreading files over several domains) was a workaround for the HTTP/1.1 limit of about six connections per [origin](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) (scheme + host + port). HTTP/2 and HTTP/3 send many requests in parallel over **one connection**. Extra domains now cost extra [DNS](/web-platform/dns/) lookups (turning a name into an IP address) and extra TCP and TLS handshakes (the setup round trips before a connection can carry requests), and they split the connection and its compression state.

Serve files from as few origins as you can (often the same one, or one CDN domain). Make loading decisions about caching and about loading only what the page needs, not about connection limits.

</details>

## 6. The rate limit that anyone can bypass

Your API limits requests per client IP, and it reads the IP from `X-Forwarded-For`. An attacker sends thousands of requests and never hits the limit. How?

<details>
<summary>Answer</summary>

Any client can send `X-Forwarded-For` with any value. The attacker puts a random IP in the header on every request, and the server believes it.

Trust this header (or `Forwarded`) only when your own proxy or CDN sets it, and only the part that your proxy added: take the address your trusted proxy saw, not the first value in the list. Most frameworks and platforms have a "trusted proxies" setting for this. The same applies to any header that a client can send: it is input, not a fact.

</details>
