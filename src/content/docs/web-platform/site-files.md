---
title: Sitemap, robots.txt and web app manifest
description: The small files that tell crawlers, browsers and other tools about your site — what robots.txt, sitemaps, noindex and the web app manifest do, what they don't do, and the other well-known files around them.
related:
  - web-platform/http
  - web-platform/page-loading
officialDocs:
  - title: Google Search Central — Introduction to robots.txt
    url: https://developers.google.com/search/docs/crawling-indexing/robots/intro
  - title: RFC 9309 — Robots Exclusion Protocol
    url: https://www.rfc-editor.org/rfc/rfc9309
  - title: Google Search Central — Build and submit a sitemap
    url: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
  - title: Google Search Central — Block indexing with noindex
    url: https://developers.google.com/search/docs/crawling-indexing/block-indexing
  - title: MDN — Web app manifest
    url: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
  - title: RFC 9116 — security.txt
    url: https://www.rfc-editor.org/rfc/rfc9116
  - title: llms.txt proposal
    url: https://llmstxt.org/
---

## What problem it solves

A website is read not only by people. Search engine crawlers decide what to fetch and index, browsers decide whether the site can be installed like an app, security researchers look for a way to report a vulnerability, and AI tools read pages too. A few small files at well-known addresses give them that information.

They fall into three groups with different jobs:

| Group | Files | Audience |
| --- | --- | --- |
| **Crawling and indexing** | `robots.txt`, `sitemap.xml`, the `noindex` rule | Search engines and other crawlers |
| **Install and app identity** | Web app manifest, icons | Browsers and operating systems |
| **Contact and agent information** | `security.txt`, `llms.txt` and others | Security researchers, AI tools |

## Crawling and indexing

Two steps that are easy to mix up:

```
crawl:  the crawler fetches the URL        ← controlled by robots.txt
index:  the search engine stores and       ← controlled by noindex
        shows the page in results
```

### robots.txt: what crawlers may fetch

A plain-text file at the root of each host: `https://shop.example/robots.txt`. Each subdomain, and each scheme and port, needs its own. It is defined by the Robots Exclusion Protocol (RFC 9309).

```
User-agent: *
Disallow: /admin/
Disallow: /cart

User-agent: GPTBot
Disallow: /

Sitemap: https://shop.example/sitemap.xml
```

- Rules are grouped by **user agent** (the crawler's name); `*` means everyone else.
- `Disallow` and `Allow` work on URL path prefixes: `Disallow: /cart` also blocks `/cartoon` (write `/cart/` or `/cart$` to be exact). When rules conflict, the most specific (longest) matching rule wins, and `Allow` wins a tie. In Google's implementation paths are case-sensitive, and `*` matches any characters.
- It controls **crawling, not indexing.** A disallowed URL can still appear in search results if other sites link to it, just without a description.
- It is **a request, not a lock.** Well-behaved crawlers follow it; others ignore it. And the file is public, so listing "secret" paths there advertises them.
- **AI crawlers** have their own names (such as `GPTBot` and `ClaudeBot`), and some companies use separate tokens for "may we use this for training" (such as `Google-Extended`). Check each company's documentation; not every crawler respects the file.

### noindex: what search engines may show

To keep a page out of search results, send `noindex`, either as `<meta name="robots" content="noindex">` in the HTML or as an `X-Robots-Tag: noindex` response header (which also works for PDFs and images).

The trap: the crawler must be **allowed to fetch** the page to see the `noindex`. A page that is both disallowed in robots.txt and marked `noindex` may stay in the index, because the crawler never reads the rule.

### Sitemaps: which URLs exist

An XML file that lists the URLs you want indexed, optionally with `lastmod` (when the content last changed):

- At most 50,000 URLs **and** 50 MB uncompressed per file; split the list when either limit is reached, and use a **sitemap index** that lists the parts. Entries are full absolute URLs (`https://shop.example/…`).
- Point to it from `robots.txt` and submit it in Google Search Console or Bing Webmaster Tools.
- It helps **discovery** (new pages, large sites, pages with few links pointing to them), but doesn't guarantee indexing.
- List only canonical URLs (the preferred address when several URLs show the same content) that return `200`, not redirects, errors or duplicates. Google uses `lastmod` only when it is accurate and ignores the `priority` and `changefreq` fields.
- Multilingual sites can declare language versions of each page with `hreflang` alternates, in the sitemap or in the HTML.

## Install and app identity: the web app manifest

A JSON file, linked from every page with `<link rel="manifest" href="/manifest.webmanifest">`, that describes the site as an app:

- `name` and `short_name`: the app's names;
- `icons`: several sizes (Chromium-based browsers expect 192 and 512 pixels for their install prompt), ideally plus a **maskable** icon: a version designed with a safe margin and marked `purpose: "maskable"`, which the operating system can crop into its own shape;
- `start_url`, `scope` and `id`: where the installed app opens, which URLs belong to it, and its stable identity;
- `display`: `standalone` (its own window without browser controls), `fullscreen`, `minimal-ui` or `browser`;
- `theme_color` and `background_color`: the colors of the title bar and the launch screen;
- optionally `shortcuts`, `screenshots` and a `description`, shown in install dialogs.

The manifest turns a site served over [HTTPS](/web-platform/http/#https-what-tls-adds) into a **progressive web app** (PWA) with its own name, icon and window. Some browsers let users install any site by hand, manifest or not; the manifest gives the installed app its identity and, where supported, lets the browser actively offer installation. Each browser has its own criteria and UI, and iOS Safari still relies partly on separate `<link rel="apple-touch-icon">` icons. A **[service worker](/web-platform/offline-and-storage/#service-workers-a-proxy-in-the-browser)** (a background script the browser runs for your site, which can intercept its requests) is a separate piece: offline support comes from the [caching](/architecture/caching/) strategy you implement in it, not from the manifest ([skipping the network](/web-platform/page-loading/#the-journey)).

Every site, installable or not, also needs **favicons** (the icons in browser tabs and bookmarks): a `<link rel="icon">` (an SVG icon works in modern browsers, with a PNG or ICO fallback) and an `apple-touch-icon`.

## Contact and agent information

- **`security.txt`** at `/.well-known/security.txt` (RFC 9116): how to report a security vulnerability. Served over HTTPS, with two required fields: `Contact` (an email address or reporting page) and `Expires` (the date after which the file counts as stale). Cheap to add, but it needs upkeep: keep the contact working and renew the date. It saves researchers from guessing.
- **`/.well-known/`** is the standard folder for such files (RFC 8615). Other examples: files that link a domain to a mobile app (`apple-app-site-association`, `assetlinks.json`), and `change-password`, which redirects password managers to your change-password page.
- **`llms.txt`** is a **proposal**, not a standard: a Markdown file at `/llms.txt` that summarizes the site and links its key pages for large language models. Some documentation sites publish one; whether AI tools use it is up to each tool. Treat it as optional.
- **`ads.txt`** lists who is allowed to sell ads on your site; it only matters if you show ads.

## Typical failures

- **The staging `robots.txt` [deployed](/delivery/deployment-models/#releasing-from-commit-to-users) to production.** `Disallow: /` copied from staging stops search engines from crawling the site: new pages and changes no longer reach search, and visibility can drop badly. It doesn't reliably remove pages that are already known either; for deliberate removal use a crawlable `noindex` or [authentication](/security/auth/).
- **Preview and staging deployments indexed.** Protect them with authentication or `X-Robots-Tag: noindex`; some hosting platforms add this header to preview deployments automatically.
- **`Disallow` plus `noindex` on the same page**, so the `noindex` is never seen.
- **robots.txt used to hide private URLs.** It advertises them; use authentication.
- **Blocking CSS and JavaScript in robots.txt**, so search engines can't render the page as users see it.
- **Sitemaps full of redirects, 404s and duplicates**, or a `lastmod` that always says "today", which teaches the search engine to ignore it.
- **A manifest with wrong icon sizes**, an ordinary icon declared as maskable (and cropped badly), or a `start_url` outside its `scope`.
- **A missing `security.txt`**, so a researcher's report goes to a random support inbox.

## When you need which

- **Any public site:** a `robots.txt` (even a permissive one with the `Sitemap` line), a sitemap if it has more than a handful of pages, favicons, and `noindex` on anything that must not appear in search.
- **Sites users return to often** (tools, dashboards, content they read daily): a web app manifest, so it can be installed as an app with its own icon and window.
- **Any company site:** `security.txt`.
- **Documentation and content that AI tools should read well:** consider `llms.txt`, knowing it is a proposal.

Frameworks generate most of these from code: Next.js has `sitemap`, `robots` and `manifest` files in the `app` directory, and Astro has a sitemap integration. (This book uses the Astro integration: its sitemap is at `/sitemap-index.xml`, linked from its `robots.txt`.)

## Landscape

- **Search engine tools:** Google Search Console, Bing Webmaster Tools; the URL Inspection tool shows how Google sees a page.
- **Generators:** framework conventions (Next.js metadata files, Astro and Nuxt sitemap modules), `next-sitemap`.
- **Faster discovery:** IndexNow, a protocol to notify Bing, Yandex and others about changed URLs.
- **Manifests and icons:** the DevTools Application panel (manifest and installability errors), PWA Builder, RealFaviconGenerator.
- **Standards:** RFC 9309 (robots.txt), sitemaps.org, the W3C Web Application Manifest, RFC 8615 (`.well-known`), RFC 9116 (security.txt).
