---
title: Browser boundaries and CORS — check yourself
description: Scenario questions about CORS errors, credentials, origins and where to put untrusted content.
quizFor: security/browser-boundaries
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. "Fixing" a CORS error with `no-cors`

A frontend on `https://app.example` calls `https://api.partner.example/prices` and gets a CORS error (the browser refuses to let the script read a response from another origin, meaning another scheme, host or port). A developer adds `mode: 'no-cors'` to `fetch`, the error disappears, but the data is empty. What happened, and what is the real fix?

<details>
<summary>Answer</summary>

`no-cors` asks for an **opaque response**: the request is sent, but the script is not allowed to see the status, headers or body. The error went away because the code gave up on reading, not because access was granted.

The [same-origin policy](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) (the browser rule that keeps one origin's scripts from reading another origin's data) blocks **reading**, and only the owner of the resource can allow it with [CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read). The fix is on the server: `api.partner.example` must send `Access-Control-Allow-Origin: https://app.example` (and answer the preflight, the browser's permission request sent before some cross-origin requests, if there is one). If you don't control that server, call it from your own backend, which isn't limited by CORS, and serve the result from your origin.

</details>

## 2. "Only our frontend can call the API"

A team restricts CORS on its API to `https://app.example` and says that now nobody else can use the API, so it doesn't need [rate limiting](/architecture/reliability/#protecting-a-service-from-overload) (a cap on how often a client may call) or strict [authorization](/security/auth/#authorization-checking-what-is-allowed) checks. Are they right?

<details>
<summary>Answer</summary>

No. CORS only controls what **browsers** let scripts on other sites read. `curl`, a Python script or a mobile app ignores CORS completely and can call every endpoint. Even in a browser, simple requests are sent and run on the server; only the response is hidden.

The API still needs authentication and authorization on every request, and rate limiting against abuse. CORS protects your users inside their browser, not your server.

</details>

## 3. A CORS config that trusts everyone

To support many partner sites, the server copies the request's `Origin` header into `Access-Control-Allow-Origin` and also sends `Access-Control-Allow-Credentials: true`. What is the risk?

<details>
<summary>Answer</summary>

Every site on the internet is now allowed to read responses **with your users' cookies**. A user who is logged in to your app opens a malicious page; its script calls your API with `credentials: 'include'`, the cookies are attached (if `SameSite` allows it), and the response, with personal data, is readable by the attacker.

Use a fixed **allowlist** of full origins and compare exact strings (not `endsWith`, which also matches `evilapp.example`). Don't allow `Origin: null`. Send `Vary: Origin` and make sure any cache in front of the API keeps a separate copy per origin (question 6), so one origin's permission isn't served to another. If partners need data without user cookies, give them a credential-free API instead.

</details>

## 4. Where should user uploads live?

Users can upload HTML and SVG files that other people can open. You plan to serve them from `https://files.shop.example`. Is that a good choice?

<details>
<summary>Answer</summary>

Risky. `files.shop.example` is a different **origin**, but the same **site** as `shop.example`. A malicious uploaded HTML page runs with your registrable domain: its requests to `shop.example` count as same-site, so `SameSite` cookies are sent with them, and a cookie set with `Domain=shop.example` is shared with it.

Serve untrusted content from a **separate registrable domain**, such as `shop-usercontent.example`. That is why GitHub Pages uses `github.io` and Google uses `googleusercontent.com`. Also serve uploads with `Content-Disposition: attachment` or a strict [CSP](/security/web-attacks/#csp-limiting-what-can-run) (a header that limits which scripts may run) where you can. The cost is one more domain to buy and configure.

</details>

## 5. A preflight before every request

The app lives on `https://app.shop.example` and the API on `https://api.shop.example`. Every API call shows two requests in the Network tab: `OPTIONS`, then the real one. Mobile users feel the delay. What are your options?

<details>
<summary>Answer</summary>

These are **preflights**: the two hosts are different origins (same site is not enough), and the requests use JSON bodies or an `Authorization` header, so the browser asks for permission first.

Options:

- Serve the API under the **same origin**, for example at `/api` on `app.shop.example`, routed by a [reverse proxy or CDN](/web-platform/cdn/#mental-model-a-reverse-proxy-in-front-of-everything). No CORS, no preflights, simpler cookies. This is usually the best choice for an app and its own API.
- Keep separate origins and send `Access-Control-Max-Age`, so the browser caches the preflight answer.

Forcing requests to look "simple" (for example sending JSON as `text/plain`) avoids the preflight, but it hides the real content type and weakens a defense against [CSRF](/security/web-attacks/#csrf-requests-the-user-didnt-mean) (another site making the browser send requests with the user's cookies); don't do it.

</details>

## 6. CORS errors that come and go

The API allows two origins, `https://app.example` and `https://admin.example`, and returns the matching one in `Access-Control-Allow-Origin`. After a [CDN](/web-platform/cdn/) (a caching network of servers near users) was added in front of the API, the admin panel randomly gets CORS errors. Why?

<details>
<summary>Answer</summary>

The CDN cached a response with `Access-Control-Allow-Origin: https://app.example` and served the same copy to requests from `admin.example`. The browser sees a header for the wrong origin and blocks the read.

When a response depends on the `Origin` header, send **`Vary: Origin`** (see [`Vary`](/architecture/caching/#http-caching-the-shared-language)), which tells caches to keep a separate copy per origin. Then check the CDN itself: some CDNs ignore `Vary` by default, so add `Origin` to the CDN's cache key or don't cache these responses there. Verify by calling the API alternately from both origins. The trade-off is a slightly lower hit rate: one copy per allowed origin.

</details>
