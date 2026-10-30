---
title: Web attacks and defenses
description: How XSS, CSRF, clickjacking and malicious third-party code work, and the layered defenses that stop them.
related:
  - security/browser-boundaries
  - security/auth
  - web-platform/http
officialDocs:
  - title: OWASP — Cross Site Scripting Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
  - title: OWASP — Cross-Site Request Forgery Prevention Cheat Sheet
    url: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  - title: MDN — Content Security Policy (CSP)
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
  - title: web.dev — Mitigate cross-site scripting with a strict CSP
    url: https://web.dev/articles/strict-csp
  - title: MDN — Trusted Types API
    url: https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API
  - title: OWASP Top 10
    url: https://owasp.org/Top10/
---

## What problem it solves

The browser runs your site's code with full power over the user's session on your site. The [browser's boundaries](/security/browser-boundaries/) keep other sites out. The main attacks try to get around them:

- get the attacker's code to run **as your site** (XSS). Then the boundaries don't help, because the attacker *is* your origin;
- make the user's browser **send a request to your site** from another site, with the user's cookies (CSRF);
- trick the user into **clicking on your UI** inside someone else's page (clickjacking);
- get malicious code in through a **dependency or third-party script** you include yourself.

Frontend code is where most XSS bugs appear, so this is the frontend developer's part of security. Server-side attacks such as SQL injection are out of scope here.

## Mental model: what the attacker controls

| Attack | The attacker controls | Code runs on | What they get | Main defenses |
| --- | --- | --- | --- | --- |
| **XSS** (cross-site scripting) | Data that your page turns into code | Your origin | Everything the user can do on your site | Escaping, safe APIs, sanitizing, CSP, Trusted Types |
| **CSRF** (cross-site request forgery) | A page on another site that the user visits | Their site; the request goes to yours | One state-changing request with the user's cookies, without seeing the response | `SameSite` cookies, origin checks, CSRF tokens |
| **Clickjacking** | A page that shows yours in an invisible frame | Their site | Clicks on your UI that the user didn't intend | `frame-ancestors` |
| **Supply chain** | A script or package you include | Your origin | The same as XSS | Fewer third parties, pinned versions, SRI, CSP |

**XSS beats every other defense.** Code running on your origin can read CSRF tokens from the page and call your API. An `HttpOnly` cookie can't be **read** by that code, but it is still **used**: every request the injected code makes carries the cookie. So `HttpOnly` stops session theft, not misuse while the page is open.

## XSS: data that becomes code

XSS happens when data from outside (a comment, a URL parameter, a [CMS](/data/cms/) field) ends up in a place where the browser interprets it as HTML or JavaScript.

- **Stored XSS**: the payload is saved (a comment, a profile name) and shown to every visitor.
- **Reflected XSS**: the payload comes from the request (a search query in the URL) and is echoed back in the response.
- **DOM-based XSS**: client-side code takes data from `location`, `postMessage` or storage and writes it into a dangerous place.

The dangerous places are called **sinks**:

- HTML sinks: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, React's `dangerouslySetInnerHTML`, Vue's `v-html`;
- URL sinks: `href` or `src` with a `javascript:` URL;
- code sinks: `eval`, `new Function`, `setTimeout` with a string, inline event handler attributes;
- server-rendered data: JSON put into a `<script>` tag without escaping `</script>`.

Modern frameworks escape text by default: `{comment}` in JSX is shown as text, never run as HTML. This removes most XSS. What remains is the escape hatches above, and URL values: frameworks don't fully protect `href`, so check that a user-provided URL starts with `https:` or `http:`.

Defenses, in layers:

1. **Keep data as text.** Let the framework escape it and avoid HTML sinks.
2. **When you must render user HTML** (rich text, Markdown, CMS content), clean it with an allowlist **sanitizer** (it removes everything not explicitly allowed) right before output. Never write your own regex filter.
3. **Validate URL schemes** for links and images from users.
4. **CSP** as a second wall, in case a bug slips through.
5. **Trusted Types**: a browser feature that, once enforced with the CSP directive `require-trusted-types-for 'script'`, makes dangerous sinks accept only values created by your **policies** (functions that sanitize or validate the input). It turns "someone passed a plain string to `innerHTML`" into an error. The protection is only as good as your policies, and browser support must be checked before relying on it.

## CSP: limiting what can run

**CSP** (Content Security Policy) is a response header that tells the browser which scripts, styles, frames and connections the page may use. Its main job is to make an injected script **not run**.

Two styles:

- **Domain allowlist**, such as `script-src 'self' cdn.example.com`. Easy to write, but often bypassed: an allowed domain may host something an attacker can abuse (an old library, a JSONP endpoint).
- **Strict CSP**, based on a **nonce** (a random value, new for every response) or **hashes** of allowed scripts:

  ```
  Content-Security-Policy: script-src 'nonce-R4nd0m' 'strict-dynamic'; object-src 'none'; base-uri 'none'
  ```

  Only scripts that carry the nonce run; scripts they load are trusted too (`'strict-dynamic'`). An injected `<script>` has no nonce and is blocked.

The architecture catch: a nonce must be **different in every response**. HTML served unchanged from a CDN cache or a static build gives everyone the same nonce. The options: render per request; rewrite the cached HTML at the edge to insert a fresh nonce into your own trusted script tags (never into every script tag found); or use hash-based CSP, the simple option for static pages. This links security to the [rendering strategy](/architecture/rendering/) and [caching](/architecture/caching/).

Roll out safely: start with `Content-Security-Policy-Report-Only` and a reporting endpoint, fix what the reports show, then enforce.

Other useful directives: `frame-ancestors` (who may frame you), `form-action` (where forms may submit), `connect-src` (where scripts may send data), `upgrade-insecure-requests`.

CSP is defense in depth. It doesn't fix the XSS bug; it limits the damage.

## CSRF: requests the user didn't mean

```
1. The user is logged in to bank.example (session cookie in the browser).
2. The user opens evil.example.
3. evil.example contains a hidden form that auto-submits:
     POST https://bank.example/transfer  to=attacker&amount=1000
4. The browser sends it with the bank cookie (depending on SameSite).
5. The bank sees a valid session and runs the transfer.
```

The [same-origin policy](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) stops evil.example from reading the response, but the action already happened.

CSRF needs **credentials that the browser attaches automatically**, which means cookies (and browser-managed HTTP authentication). An API that uses an `Authorization: Bearer` header added by your own code isn't exposed to CSRF in the same way, because another site can't make the browser add it.

Defenses:

- **`SameSite=Lax` or `Strict`** on session cookies. This blocks most cross-site requests from carrying the cookie. Set it explicitly: not every browser defaults to `Lax`.
- **Never change state on `GET`.** `Lax` still sends cookies on top-level `GET` navigations, so a `GET /delete?id=5` link remains open to attack ([methods](/web-platform/http/#methods-what-a-request-promises)).
- **Check where the request came from.** For state-changing requests, compare the `Origin` header with your own origin (or a fixed list of trusted origins), or use the `Sec-Fetch-Site` header, which says whether the request is `same-origin`, `same-site` or `cross-site`. `Sec-Fetch-Site` doesn't say *which* subdomain sent a `same-site` request, so if any subdomain is not fully trusted, treat `same-site` like `cross-site` or check the exact `Origin`. All modern browsers send these headers; decide in advance what to do when they are missing (older clients, some privacy tools), for example fall back to a CSRF token.
- **CSRF tokens**: a secret value put in the page and sent back with each form or request. The other site can't read it, so it can't include it. Most server frameworks have this built in.
- **Remember the subdomain gap.** `SameSite` trusts the whole site, so a compromised subdomain can still send same-site requests.

A variant to know: **login CSRF**, where the attacker logs the victim into the *attacker's* account, and the victim then saves their data there.

## Clickjacking and other UI attacks

**Clickjacking**: the attacker's page loads your page in a transparent iframe on top of a harmless-looking button. The user thinks they click "Play video" but click "Delete account" on your site, with their own session.

Defense: `Content-Security-Policy: frame-ancestors 'none'` (nobody may frame you) or `'self'` (only your own origin). For old browsers, the older `X-Frame-Options` header does the same: `DENY` matches `'none'`, `SAMEORIGIN` matches `'self'`.

A smaller one: **reverse tabnabbing**, where a page opened with `target="_blank"` used `window.opener` to send the original tab to a phishing page. Modern browsers now apply `noopener` to such links by default.

## Supply chain: code you didn't write

Every third-party script (analytics, a chat widget, a tag manager) and every npm package that ends up in the bundle runs with **full rights on your origin**. If its source is compromised, the attacker gets the same power as XSS on every page that includes it.

A real case: in 2024 the `polyfill.io` domain changed owners, and the new owner served malicious code to the many sites that still loaded scripts from it.

Defenses:

- Fewer third parties, and review them like dependencies.
- Self-host scripts with pinned versions, or use **SRI** (Subresource Integrity: an `integrity` attribute with the file's hash; the browser refuses a changed file). SRI works only for fixed versions.
- Lockfiles, dependency review, and automated alerts for vulnerable or suspicious packages.
- CSP limits where scripts load from and where they can send data.
- Isolate risky widgets in sandboxed iframes on another origin.

## Typical failures

- **`dangerouslySetInnerHTML` with CMS or Markdown content** that nobody sanitized.
- **Sanitizing input once and using it everywhere.** HTML escaping is wrong for URLs or JavaScript; escape for the context where the data is used.
- **CSP with `'unsafe-inline'` and `'unsafe-eval'`.** It looks like a policy but gives almost no XSS protection.
- **A nonce in cached HTML.** Every visitor gets the same nonce, and so does the attacker.
- **State changes on `GET`**, which bypass `SameSite=Lax`.
- **CORS that reflects any origin with credentials.** It removes the read barrier, so CSRF-style attacks can also read data ([CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read)).
- **Moving tokens to [`localStorage`](/web-platform/offline-and-storage/#storage-options) "to avoid CSRF".** It trades CSRF for token theft through any XSS ([where to keep credentials](/security/auth/#where-the-browser-keeps-credentials)).
- **Trusting frontend validation.** It improves UX; the server must validate again.

## Where to put the effort

In order of value for a typical web app:

1. Framework escaping everywhere; no raw HTML sinks except a few reviewed, sanitized ones.
2. Session cookies with `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`) and the `__Host-` prefix.
3. No state changes on `GET`; origin checks or the framework's CSRF protection for cookie-based APIs.
4. `frame-ancestors` on every page.
5. A strict CSP, started in report-only mode.
6. Third-party scripts treated as dependencies: few, reviewed, pinned.

The most common real-world bug is not on this page: a user changes `/orders/42` to `/orders/43` and sees someone else's order, because the server checked *that* they are logged in but not *what* they may see. That is [authorization](/security/auth/#authorization-checking-what-is-allowed).

## Landscape

- **Sanitizers:** DOMPurify; the browser's emerging HTML Sanitizer API (`setHTML`).
- **CSP:** nonce support in SSR frameworks, Google's CSP Evaluator, report collectors (Report URI, Sentry).
- **Scanners and testing:** OWASP ZAP, Burp Suite; dependency tools such as `npm audit`, GitHub Dependabot, Snyk, Socket.
- **References:** OWASP Top 10, the OWASP Cheat Sheet Series, PortSwigger Web Security Academy.
