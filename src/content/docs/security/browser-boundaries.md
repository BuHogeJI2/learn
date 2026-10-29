---
title: Browser security boundaries
description: Origin and site, the same-origin policy, CORS and when the browser attaches cookies — the rules that stop one website from reading another.
related:
  - web-platform/http
  - security/web-attacks
  - security/auth
officialDocs:
  - title: MDN — Same-origin policy
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy
  - title: MDN — Cross-Origin Resource Sharing (CORS)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
  - title: web.dev — Understanding "same-site" and "same-origin"
    url: https://web.dev/articles/same-site-same-origin
  - title: MDN — Third-party cookies
    url: https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies
  - title: Fetch Standard — CORS protocol
    url: https://fetch.spec.whatwg.org/#http-cors-protocol
---

## What problem it solves

You are logged in to your bank in one tab and open a random site in another. The browser holds your bank cookies. Without rules, the random site's JavaScript could call `fetch("https://bank.example/account")`, the browser would attach your cookies, and the script would read your balance.

The browser is one program that runs code from many parties who don't trust each other. Its security boundaries decide what code from one place may **read** or **do** with another place.

One thing to keep in mind from the start: these rules protect the **user inside the browser**. They don't protect your server. `curl`, a script or a mobile app ignores all of them. Your server still has to check who is calling ([authentication and authorization](/security/auth/)).

## Mental model: origin, site and three kinds of access

**Origin** = scheme + host + port. Two URLs are same-origin only if all three match.

**Site** = scheme + registrable domain (the part you buy from a registrar, such as `shop.example`; for `api.shop.example` the site is still `shop.example`). Some domains are on the **Public Suffix List** (such as `github.io`), so `alice.github.io` and `bob.github.io` are different sites.

Compared with `https://shop.example`:

| URL | Same origin? | Same site? | Why |
| --- | --- | --- | --- |
| `https://shop.example/cart` | Yes | Yes | Only the path differs |
| `http://shop.example` | No | No | Different scheme |
| `https://shop.example:8443` | No | Yes | Different port |
| `https://api.shop.example` | No | Yes | Different host, same registrable domain |
| `https://other.example` | No | No | Different registrable domain |

Different rules use different units: the **same-origin policy** and storage use the origin; `SameSite` cookies and cookie partitioning use the site. Cookies are older than the same-origin policy and follow their own scope rules (`Domain`, `Path`), not the origin.

The **same-origin policy** splits cross-origin interactions into three kinds:

```
Page on https://app.example
  │
  ├─ <img src="https://cdn.other/x.png">       embed:  allowed
  ├─ <form action="https://bank.example/pay">   send:   allowed (cookies depend on SameSite)
  └─ fetch("https://api.other/data")            send:   allowed
                                                read:   only if api.other allows it (CORS)
```

- **Writes** (links, redirects, form submissions) to another origin are allowed.
- **Embedding** (`<img>`, `<script>`, stylesheets, `<iframe>`, media) is allowed, unless the other server forbids it with headers.
- **Reads** are blocked by default: JavaScript can't see a cross-origin response, the DOM of a cross-origin iframe, or the pixels of a cross-origin image drawn on a canvas.

The key point: **the policy stops reading, not sending**. A cross-origin request often reaches the server and runs there; the browser just doesn't hand the response to the script. That gap is exactly what [CSRF](/security/web-attacks/#csrf-requests-the-user-didnt-mean) attacks use.

## CORS: the server opts in to being read

**CORS** (Cross-Origin Resource Sharing) lets a server relax the same-origin policy for its own responses. It is permission from the **owner of the resource**, and the browser enforces it.

**Simple requests** (`GET`, `HEAD` or `POST` with only basic headers and a form-like content type: `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) are sent directly with an `Origin` header. If the response has no matching `Access-Control-Allow-Origin`, the script gets an error. But the request has **already reached the server and run**.

**Other requests** (`PUT`, `DELETE`, a JSON body, custom headers such as `Authorization`) first get a **preflight** (an automatic `OPTIONS` request that asks for permission):

```
Browser (app.example)                          api.example
  │── OPTIONS /orders/42                      ──►│
  │   Origin: https://app.example                │
  │   Access-Control-Request-Method: PUT         │
  │◄── 204                                     ──│
  │   Access-Control-Allow-Origin: https://app.example
  │   Access-Control-Allow-Methods: PUT
  │   Access-Control-Max-Age: 600
  │── PUT /orders/42  (the real request)      ──►│
  │◄── 200 + Access-Control-Allow-Origin        ──│  → the script can read it
```

`Access-Control-Max-Age` lets the browser cache the preflight answer, so not every request costs an extra round trip.

**Credentials.** By default, a cross-origin `fetch` does **not** send cookies. With `credentials: 'include'`, the browser may send them, but only cookies that their own rules still allow (`SameSite`, `Domain`, `Secure`, third-party cookie blocking); `include` doesn't override those rules. For the script to read the response, it must include `Access-Control-Allow-Credentials: true` and a **specific** origin, not `*`.

What follows from this:

- **A CORS error is fixed on the server**, not in `fetch` options. `mode: 'no-cors'` gives an opaque response that the script can't read; it hides the error, it doesn't fix it.
- **CORS is not access control for your API.** It only controls what browsers let scripts read. Non-browser clients ignore it.
- **Same site still needs CORS.** `app.shop.example` calling `api.shop.example` is cross-origin.
- **The cheapest CORS is none.** Serving the API under the same origin (`/api` on the same domain, routed by a [reverse proxy or CDN](/web-platform/cdn/#mental-model-a-reverse-proxy-in-front-of-everything)) removes preflights and keeps cookies simple.

## When the browser sends cookies

Cookie basics are on the [HTTP page](/web-platform/http/#cookies-at-the-protocol-level). For security, two attributes matter most:

| `SameSite` | Sent on same-site requests | Sent on top-level navigation from another site (clicking a link) | Sent on other cross-site requests (`fetch`, forms that `POST`, iframes, images) |
| --- | --- | --- | --- |
| `Strict` | Yes | No | No |
| `Lax` | Yes | Yes, for safe methods such as `GET` | No |
| `None` (requires `Secure`) | Yes | Yes | Yes, unless the browser blocks third-party cookies. A **partitioned** cookie is sent only under the same top-level site where it was set |

And scope:

- A cookie **without `Domain`** is host-only: sent only to the exact host that set it.
- `Domain=shop.example` sends it to **every subdomain** too.
- The `__Host-` name prefix forces `Secure`, `Path=/` and no `Domain`. The cookie is locked to one host, and subdomains can't overwrite it.

Remember that `SameSite` works with **sites**: `blog.shop.example` is same-site with `shop.example`. A subdomain with user content or a forgotten marketing page can send same-site requests with your users' cookies.

## Other boundaries worth knowing

- **Storage** (`localStorage`, IndexedDB) is per origin. Third-party iframes get **partitioned** storage: a separate copy for each top-level site.
- **Iframes and windows.** A cross-origin iframe can't touch the parent's DOM. They talk through `postMessage`; the receiver must check `event.origin`, and the sender should name the target origin instead of `'*'`.
- **Who may frame you** is controlled by the `frame-ancestors` directive of CSP (see [clickjacking](/security/web-attacks/#clickjacking-and-other-ui-attacks)).
- **Process isolation.** Browsers run different sites in different processes, so a bug like Spectre (reading memory through CPU timing) can't reach another site's data. Pages that need powerful features such as `SharedArrayBuffer` must opt in to **cross-origin isolation** with the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.

## Typical failures

- **Reflecting any `Origin` with `Allow-Credentials: true`.** The server copies whatever origin asks into `Access-Control-Allow-Origin`. Now every site on the internet can read your logged-in users' data.
- **Weak allowlist checks.** `origin.endsWith("shop.example")` also matches `evilshop.example`. Compare full origins from a fixed list.
- **Allowing the `null` origin.** Sandboxed iframes and local files send `Origin: null`, and an attacker can produce it on purpose.
- **Forgetting `Vary: Origin`** when the allowed origin changes per request. A CDN caches the header for the first origin and serves it to all ([`Vary`](/architecture/caching/#http-caching-the-shared-language)).
- **Treating CORS as protection.** "Only our frontend can call this API" is false; anyone can call it outside a browser.
- **A wide `Domain` cookie** shared with every subdomain, including ones run by third parties.
- **`postMessage` without an origin check**, or sending secrets with target `'*'`.
- **A preflight on every request**, because `Max-Age` is missing or the API sits on another origin without a reason.

## Designing around the boundaries

- **One origin for the app and its API** when you can. No CORS, no preflights, and `SameSite=Lax` cookies just work.
- **A separate API origin** (a public API, many client apps): an explicit allowlist of origins, credentials only when needed, `Max-Age` for preflights, `Vary: Origin`.
- **Public, read-only data** (fonts, public JSON, open APIs without cookies): `Access-Control-Allow-Origin: *` is fine.
- **Untrusted content** (user uploads, user sites, sandboxes): serve it from a **separate registrable domain**, not a subdomain of your main site. That is why GitHub Pages uses `github.io` and Google serves user files from `googleusercontent.com`.

## Landscape

- **Browser tools:** the Console shows CORS errors with the reason; the Network tab shows preflight `OPTIONS` requests; the Application panel shows each cookie's `SameSite`, `Domain` and partition.
- **Server side:** CORS middleware in every framework (the `cors` package for Express, built-in options in Fastify, Hono, NestJS, Django, Rails), CDN and API gateway rules that add CORS headers.
- **Standards:** the Fetch Standard (defines CORS and request modes), the HTML Standard (origins, `postMessage`), RFC 6265bis (cookies), the Public Suffix List.
