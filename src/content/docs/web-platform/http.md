---
title: HTTP and HTTPS
description: The language browsers and servers speak, what each part of a message means, and what TLS adds.
related:
  - web-platform/page-loading
  - architecture/api-styles
officialDocs:
  - title: MDN — An overview of HTTP
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview
  - title: MDN — HTTP request methods
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods
  - title: MDN — HTTP response status codes
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status
  - title: MDN — Using HTTP cookies
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies
  - title: MDN — Evolution of HTTP
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Evolution_of_HTTP
  - title: MDN — Transport Layer Security
    url: https://developer.mozilla.org/en-US/docs/Web/Security/Transport_Layer_Security
  - title: RFC 9110 — HTTP Semantics
    url: https://www.rfc-editor.org/rfc/rfc9110
  - title: RFC 9114 — HTTP/3
    url: https://www.rfc-editor.org/rfc/rfc9114
---

## What problem it solves

A browser and a server are written by different people, in different languages, and run on different machines. They need a shared language for "give me this" and "do this". HTTP is that language: a **request/response protocol**. The client sends a request, the server sends back one final response (sometimes preceded by short informational ones, such as `103 Early Hints`).

HTTPS is the same HTTP sent inside a TLS (Transport Layer Security) connection. TLS makes the conversation private and tamper-proof, and proves that the server really owns the domain.

## Mental model: a message with three parts

Every HTTP message has the same parts: a **start line**, **headers** (metadata as `Name: value` pairs) and an optional **body**. Below is the readable HTTP/1.1 text form. HTTP/2 and HTTP/3 carry the same parts in binary frames, with the start line turned into special headers such as `:method` and `:status`.

```
GET /products/42 HTTP/1.1                 ← method + target + version
Host: shop.example                        ← headers
Accept: application/json
Cookie: session=abc123
                                          ← empty line, then body (none for GET)

HTTP/1.1 200 OK                           ← version + status code
Content-Type: application/json            ← headers
Cache-Control: max-age=60
Set-Cookie: theme=dark; Secure; HttpOnly

{"id": 42, "name": "Lamp", "price": 49}   ← body
```

Two ideas explain most of HTTP's behavior:

- **HTTP is stateless.** Each request carries everything the server needs; the server doesn't remember the previous request. "Logged in" or "cart" state is added on top, with cookies or tokens that the client sends again on every request.
- **Meaning is separate from transport.** Methods, status codes and headers mean the same in HTTP/1.1, HTTP/2 and HTTP/3; they are defined once, in RFC 9110. The versions differ only in how the bytes travel. So you reason about API design with the semantics, and about performance with the versions.

## Methods: what a request promises

A method tells everyone on the path (browser, proxies, [CDN](/web-platform/cdn/), crawlers) what kind of operation this is. Two properties matter most:

- **Safe**: the request is not expected to change anything on the server.
- **Idempotent**: sending the same request twice has the same effect as sending it once. This makes it safe to **[retry](/architecture/reliability/#retries-bounded-spaced-and-safe)** after a timeout.

| Method | Typical use | Safe | Idempotent | Cacheable |
| --- | --- | --- | --- | --- |
| `GET` | Read a resource | Yes | Yes | Yes |
| `HEAD` | Like `GET`, headers only | Yes | Yes | Yes |
| `POST` | Create something, or run an action | No | No | Rarely |
| `PUT` | Replace a resource completely | No | Yes | No |
| `PATCH` | Change part of a resource | No | Not guaranteed | No |
| `DELETE` | Delete a resource | No | Yes | No |
| `OPTIONS` | Ask what is allowed; used for [CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read) preflight (the browser asks the server for permission before a cross-origin request with a non-basic method, header or content type) | Yes | Yes | No |

These are promises, not enforcement: nothing stops a server from deleting data on `GET`. But the rest of the web believes the promise. Browsers prefetch links, crawlers follow them, and proxies retry idempotent requests on their own. A "delete" action behind a `GET` link will be triggered by someone who only looked.

## Status codes: the server's verdict

The first digit is the class, and it is what most software looks at:

| Class | Meaning | Codes worth knowing |
| --- | --- | --- |
| `1xx` | Informational | `103 Early Hints` (start loading these files while I prepare the page) |
| `2xx` | Success | `200 OK`, `201 Created`, `204 No Content` |
| `3xx` | Go somewhere else | `301`/`308` moved permanently, `302`/`307` temporarily, `304 Not Modified` (your cached copy is still good) |
| `4xx` | The client's request is wrong | `400` bad request, `401` not authenticated, `403` refused (often: logged in but not allowed), `404`, `409` conflict, `422` invalid data, `429` too many requests |
| `5xx` | The server failed | `500` server error, `502` bad gateway, `503` unavailable, `504` gateway timeout |

What the codes tell you in practice:

- **Retry or not.** Most `4xx` codes will fail again unless the request changes, so don't retry them. `429`, `503` and some other `5xx` codes may succeed later: retry a few times with a growing delay, and respect `Retry-After` if the server sends it. But the status alone doesn't make a retry safe. A `500` after a `POST` may mean the order was already created; retry only idempotent requests, or requests with an [idempotency key](/architecture/api-styles/#error-boundaries).
- **Where to look.** `502` and `504` come from something **in the middle** (a CDN, a [load balancer](/architecture/scaling/#load-balancing), a proxy) that couldn't get an answer from the server behind it. The bug is often in that upstream server, or in the connection to it, not in the proxy.
- **Permanent really means permanent.** Browsers cache `301` and `308` redirects, sometimes for a very long time. A wrong permanent redirect is hard to undo. `307` and `308` also guarantee that the method and body are kept; `301` and `302` historically allowed clients to switch `POST` to `GET`.

## Headers: metadata that drives behavior

Headers are where most of the web's features live. The main groups:

- **Content negotiation**: `Accept` (what the client wants), `Content-Type` (what the body is), `Accept-Encoding` / `Content-Encoding` (compression such as `gzip`, `br`, `zstd`).
- **Caching**: `Cache-Control`, `ETag`, `Vary`. See [Caching](/architecture/caching/#http-caching-the-shared-language).
- **Identity and state**: `Cookie` / `Set-Cookie`, `Authorization` (a token sent by the client code).
- **Security policies**: `Strict-Transport-Security` (always use HTTPS), [`Content-Security-Policy`](/security/web-attacks/#csp-limiting-what-can-run) (which scripts may run), CORS headers `Access-Control-*` (which other sites may read the response).
- **Proxy information**: `Host` (which site on a shared server), `Forwarded` / `X-Forwarded-For` (the original client IP when a proxy sits in between).

## Cookies at the protocol level

A cookie is a small piece of data that the server asks the browser to keep. The server sends `Set-Cookie`; after that, the browser **automatically** attaches the cookie in the `Cookie` header of every matching request.

Attributes control where and how it is sent:

| Attribute | Effect |
| --- | --- |
| `Domain`, `Path` | Which URLs receive the cookie |
| `Expires` / `Max-Age` | Lifetime; without them it is a session cookie, deleted when the browser session ends (but browsers that restore the previous session may keep it) |
| `Secure` | Only sent over HTTPS |
| `HttpOnly` | Not readable from JavaScript, which protects it from being stolen by injected scripts ([XSS](/security/web-attacks/#xss-data-that-becomes-code)) |
| `SameSite` | Whether it is sent on requests that come from other sites: `Strict`, `Lax` or `None`. Set it explicitly: browsers differ in the default (Chrome treats a missing value as `Lax`) |

The automatic sending is both the main convenience and the main risk. It is why a login survives page reloads with no code, and also why another site can try to make your browser send a request *with your cookies*. That is the attack ([CSRF](/security/web-attacks/#csrf-requests-the-user-didnt-mean)) that `SameSite` and other defenses exist for. Cookies are also sent with every matching request, including requests for images, so keep them small (about 4 KB is the limit per cookie).

**Third-party cookies** (cookies of a different site than the one in the address bar) are increasingly restricted. Safari blocks them by default; Firefox partitions them (an embedded site gets a separate cookie jar for each top-level site), so they can't track users across sites. Don't build new features on them.

## HTTPS: what TLS adds

TLS gives three guarantees:

1. **Confidentiality**: nobody on the network can read the content.
2. **Integrity**: nobody can change it on the way without being detected.
3. **Authentication**: the server shows a **certificate**, signed by a certificate authority the browser trusts, which proves the server controls the domain.

```
Client                                   Server
  │── ClientHello (versions, key share) ──►│
  │◄── ServerHello, certificate, key share ─│   TLS 1.3: one round trip
  │── encrypted HTTP request ─────────────►│
```

Things TLS does **not** do:

- It doesn't hide **which site** you visit. The domain is visible in DNS (unless it is encrypted) and in the TLS handshake (until Encrypted Client Hello is widely used), and IP addresses are always visible.
- It doesn't say the site is **trustworthy**. A phishing site can have a perfectly valid certificate. It only proves that you are talking to whoever owns that domain.

Related mechanisms:

- **HSTS** (`Strict-Transport-Security` header) tells the browser to use only HTTPS for this domain from now on, so a first `http://` request can't be intercepted later. Domains can also be put on a preload list built into browsers.
- **Secure contexts.** Many modern browser features (service workers, geolocation, clipboard, HTTP/2 and HTTP/3 in browsers) work only over HTTPS. So HTTPS is a requirement, not an option.
- **Free certificates.** Let's Encrypt and the ACME protocol made certificates free and automatically renewed. Most hosting platforms do it for you.

## HTTP versions: same meaning, different transport

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
| --- | --- | --- | --- |
| Runs over | TCP | TCP | QUIC (over UDP) |
| Format | Text | Binary frames | Binary frames |
| Requests per connection | One at a time | Many in parallel (multiplexing) | Many in parallel, independent |
| Head-of-line blocking | Per connection | At TCP level: one lost packet stalls all streams | No: a lost packet stalls only its stream |
| Header compression | No | HPACK | QPACK |
| Connection setup | TCP + TLS | TCP + TLS | Combined, one round trip (the time for a request to reach the server and come back); survives network changes |

What this means for a frontend developer:

- **HTTP/1.1** allows about six parallel connections per [origin](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) (here: scheme + host + port, such as `https://shop.example`) in browsers. That limit created old tricks: domain sharding (spreading files over several domains), sprites and huge bundles. With HTTP/2 and HTTP/3 these tricks mostly hurt, because extra domains need extra connections.
- **HTTP/2** made many small requests cheap, but not free: each file still has overhead, and compression works better on bigger files. Bundling decisions are now about caching and loading only what is needed, not about connection limits.
- **HTTP/2 server push** is dead: browsers removed it. `103 Early Hints` and `<link rel="preload">` replaced it.
- **HTTP/3** helps most on unstable mobile networks with packet loss. The browser learns that a server supports it from the `Alt-Svc` header or a DNS record, so the very first visit often uses HTTP/2. If UDP is blocked, it falls back to HTTP/2.

You can see the version of each request in the browser's Network tab, in the Protocol column (`h2`, `h3`). See [How a browser loads a page](/web-platform/page-loading/#reading-the-network-tab).

## Typical failures

- **`GET` with side effects.** Prefetching, crawlers or link previews trigger the action.
- **`200 OK` with an error in the body.** Caches store the error as a success, [monitoring](/observability/logs-metrics-traces/) counts it as success, and clients can't decide whether to retry. (GraphQL is a special case; see [API styles](/architecture/api-styles/#how-they-compare).)
- **A permanent redirect for a temporary move.** Browsers remember it, and you can't call it back.
- **Mixed content.** An HTTPS page loads a script or image over `http://`. Browsers block or upgrade it, and the page breaks.
- **Missing cookie attributes.** A session cookie without `Secure`, `HttpOnly` and `SameSite` is easier to steal or misuse.
- **An expired certificate.** The whole site goes down for every user at once. Renewal must be automatic and monitored.
- **Trusting `X-Forwarded-For` blindly.** Any client can send this header. Trust it only when your own proxy or CDN sets it.

## Decisions you make with HTTP

HTTP is always there, so the question is not whether to use it but how:

- **Where data goes in a request.** Use the path for identity (`/orders/42`), the query for filters and paging (cacheable and shareable), the body for large or sensitive data, and headers for metadata. **Never put secrets in URLs**: URLs end up in logs, browser history and `Referer` headers.
- **Which method and status code an API uses.** They decide what caches, retries and monitoring can do for you for free.
- **Cookie or a token in the `Authorization` header** for credentials. Cookies are sent automatically and can be `HttpOnly`; a `Bearer` token needs your code to attach it, so another site can't make the browser send it, but your JavaScript can read it. The full decision is in [Authentication and authorization](/security/auth/#where-the-browser-keeps-credentials).
- **HTTP/2 and HTTP/3** are usually switched on at the CDN or hosting platform, not in your code.

## Landscape

- **Clients:** the browser `fetch` API, `curl`, Postman, Bruno, Insomnia.
- **Servers and proxies:** Nginx, Caddy (automatic HTTPS), HAProxy, Envoy, Node.js `http`, and every web framework on top of them.
- **Certificates:** Let's Encrypt and other ACME authorities, cloud certificate managers (AWS ACM, Google-managed certificates).
- **HTTP/3:** supported by all major browsers and CDNs, and by Caddy and Nginx.
- **Inspection:** browser DevTools (Network tab), `curl -v`, mitmproxy, Wireshark.
