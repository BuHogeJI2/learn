---
title: Rendering strategies
description: Who builds the HTML, when, and how the page becomes interactive — the dimensions behind CSR, SSR, SSG, ISR, streaming and islands.
related:
  - web-platform/page-loading
  - architecture/state
  - architecture/caching
officialDocs:
  - title: web.dev — Rendering on the Web
    url: https://web.dev/articles/rendering-on-the-web
  - title: React — Server Components
    url: https://react.dev/reference/rsc/server-components
  - title: React — hydrateRoot
    url: https://react.dev/reference/react-dom/client/hydrateRoot
  - title: Astro — Islands architecture
    url: https://docs.astro.build/en/concepts/islands/
---

## What problem it solves

Every page ends up as HTML in the browser, plus JavaScript that makes it interactive. Someone has to produce that HTML, at some moment, and the JavaScript has to arrive and attach to it. Where and when this happens decides:

- how fast the first content appears ([TTFB, FCP, LCP](/web-platform/page-loading/#how-the-steps-map-to-metrics)),
- how fast the page reacts to input,
- how fresh and how personal the content can be,
- what search engines and link previews see,
- how much server work each visit costs.

## Mental model: three dimensions, not a list of options

CSR, SSR, SSG, ISR and the rest are usually presented as competing options. It is more useful to see them as **points in a space of three independent questions**:

1. **Where is the HTML produced?** On a server, or in the browser by JavaScript.
2. **When?** At build time, on each request, in the background after some time, or in the browser after the JavaScript loads.
3. **How does interactivity arrive?** The whole page is hydrated, only some parts are hydrated, or the page needs no JavaScript at all.

A fourth, delivery question sits on top: is the HTML sent **all at once** or **streamed** in pieces as each part is ready?

The familiar names are combinations of answers:

| Name | Where HTML is produced | When | Interactivity |
| --- | --- | --- | --- |
| **CSR** (client-side rendering) | Browser | After the JS loads and fetches data | The whole app is JavaScript |
| **SSR** (server-side rendering) | Server | On each request | Usually the whole page hydrated |
| **SSG** (static site generation) | Server, at build | Once, at build time | Hydrated, or none |
| **ISR** (incremental static regeneration) | Server | At build, then regenerated in the background after a time or on demand | Hydrated |
| **Streaming SSR** | Server | On each request, sent in pieces | Parts hydrated as they arrive |
| **Islands** | Server or build | Build or request | Only the interactive "islands" get JavaScript |
| **[Server Components](/tools/react/server-components/)** (React components that run only on the server) | Server or build | Build or request | Only client components and the code they import ship JavaScript |

They **combine**. One page can be a static shell (the parts that are the same for everyone, prerendered once) from the build, with a personal block streamed per request, and only a search box hydrated. Modern frameworks decide this **per route** or even **per component**, not per app.

## What each choice costs

```
CSR     [empty shell][──── download JS ────][run][── fetch data ──][render]▶ content + interactive

SSR     [──── server renders ────][HTML ▶ content visible][── download JS ──][hydrate]▶ interactive

SSG     [HTML from CDN ▶ content visible][── download JS ──][hydrate]▶ interactive

Stream  [shell + placeholders ▶ visible][ slow parts stream in … ][hydrate parts]▶ interactive
```

| | CSR | SSR | SSG | ISR |
| --- | --- | --- | --- | --- |
| Time to first byte | Fast (static shell) | Slower: rendering per request | Fastest: from a [CDN](/web-platform/cdn/) | Fastest: from a CDN |
| First content | Late: after JS and data | Early | Early | Early |
| When data is read | In the browser, on each visit | On the server, on each request | At build time; stale until the next build | At build, then at each regeneration; stale in between, and longer if regeneration fails |
| Personal content | Easy | Easy | Not in the HTML: fetch in the browser or at the edge | Same as SSG |
| HTML rendering work on the server per visit (API and data costs not included) | None | On every request | None | Only on regeneration |
| Search engines, link previews | Risky: needs JS to see content | Full HTML | Full HTML | Full HTML |

About search engines: Google does run JavaScript, but later and with limits. Many other crawlers and almost all link-preview bots (chat apps, social networks) read only the HTML. If content must be found or shared, put it in the HTML.

## Hydration: the cost of HTML that looks ready

With SSR and SSG, the HTML arrives already rendered. Links and native forms work, but everything that needs JavaScript handlers doesn't work yet: a button that opens a menu does nothing. **Hydration** is the step where the framework downloads the JavaScript for the page, builds the component tree again in memory, matches it to the existing HTML and attaches event handlers.

Its costs:

- **You pay twice.** The page is rendered on the server, and its components are executed again in the browser, including the parts that never change.
- **An "uncanny valley".** The page looks ready, but clicks do nothing until hydration finishes. On slow phones this can last seconds and hurts INP (how fast the page reacts to input).
- **Mismatches.** If the browser renders something different from the server (a date, a random value, a check for `window`), the framework warns, patches or re-renders, which can flicker.

The newer approaches all try to hydrate less:

- **Islands**: the page is static HTML; only marked interactive parts get JavaScript and hydrate independently.
- **Server Components**: components that only render (no state, no handlers) run on the server or at build, and their code is never sent to the browser.
- **Selective hydration**: React hydrates each [`<Suspense>`](/tools/react/suspense/) boundary separately and first hydrates the part the user is interacting with.
- **Resumability** (Qwik): the server saves enough state in the HTML that the browser doesn't re-execute components at all; code loads only when an interaction needs it.

## Streaming

With streaming, the server sends the HTML in pieces instead of waiting for the whole page:

1. The **shell** (layout, navigation, placeholders for slow parts) goes out immediately.
2. Each slow part (a recommendation block, a user widget) is sent later in the same response, and a small script puts it in place of its placeholder.

Why it helps: a slow database query no longer delays the whole page. TTFB and first content come early, and fast parts don't wait for slow ones. In React, `<Suspense>` boundaries decide where the page can be split.

Caveats:

- **The status code and headers go out with the first piece.** Once streaming has started, the server can't change to `404` or a redirect. Frameworks handle this with special mechanisms, but it is a real constraint on where you check "does this item exist?".
- **Buffering in the middle.** A proxy or CDN that buffers the whole response before forwarding it kills streaming.
- **Metadata belongs in the first piece.** Crawlers that need the `<title>` and meta tags in `<head>` may get a non-streamed render instead.

## Public and personal content

The most important boundary for rendering and caching: **is this HTML the same for every visitor?**

- **The same for everyone** (a product page, an article): it can be built once and served from a CDN to all users. SSG, ISR or a cached static shell.
- **Personal** (a user's name, their cart, prices for their region): it must never end up in a shared cache, or other users will see it. Either render it per request with no shared caching, or serve a public shell and fetch or stream the personal parts separately.

The scope rules are explained in [Caching](/architecture/caching/#mental-model-four-questions-for-every-cache). Who is allowed to see what is covered in [Authentication and authorization](/security/auth/#authorization-checking-what-is-allowed).

## Typical failures

- **A pure SPA for a content site.** Slow LCP, weak search visibility, empty link previews.
- **SSR for everything with a slow backend.** Every visit waits for the slowest query. A static shell plus streamed slow parts is usually better.
- **Personal data in a statically generated or cached page.** The first visitor's data is served to everyone.
- **"SSR makes it fast."** SSR improves first content but ships the same JavaScript. If hydration is heavy, the page still reacts slowly.
- **Hydration mismatches** from rendering time-dependent or browser-only values on the server.
- **Client-side waterfalls.** A component fetches data after it renders, then its child fetches after *it* renders. Each level adds a round trip (the time for a request to reach the server and come back). Fetching on the server, or starting all fetches at the route level, removes the chain.

## How to choose

Ask, per route:

1. Is the content **the same for all users**, or personal?
2. How often does it **change**, and how stale may it be?
3. Must **search engines or link previews** see it?
4. Is it a **document** (mostly reading) or an **application** (mostly interacting)?
5. Where is the **data**, and how far is the server from it?

Rules of thumb:

- **Docs, blogs, marketing:** static, with islands for the few interactive parts; regenerate on demand when the [CMS publishes](/data/cms/#drafts-preview-and-publishing).
- **E-commerce:** a static or ISR catalog, with cart and personal prices fetched or streamed separately.
- **Dashboards behind login:** SSR with streaming, or CSR. Search engines don't matter, and almost everything is personal.
- **Highly interactive tools** (editors, design tools): CSR, with the server providing the API.

## Landscape

- **Next.js**: SSG, SSR, ISR, streaming, Server Components; Partial Prerendering combines a static shell with streamed parts. See [Next.js caching](/tools/nextjs/caching/).
- **React Server Components**: a React feature that frameworks implement. Server Components can run at build time or on each request, and only their rendered result reaches the browser.
- **React Router (formerly Remix)**: SSR with streaming, plus prerendering of chosen routes.
- **Astro**: static-first with islands; server islands for personal parts. This book is built with it.
- **Nuxt** (Vue), **SvelteKit**, **SolidStart**: rendering mode chosen per route.
- **Qwik**: resumability instead of hydration.
- **Plain SPA**: Vite with React, Vue or Svelte, served as static files.
