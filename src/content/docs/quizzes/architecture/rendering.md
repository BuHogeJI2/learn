---
title: Rendering strategies — check yourself
description: Scenario questions about choosing where and when HTML is produced, hydration and streaming.
quizFor: architecture/rendering
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A blog nobody can share

A company blog is a single-page app with client-side rendering (CSR: the browser builds the page with JavaScript): an empty HTML shell, then JavaScript fetches the posts. Links shared in Slack and LinkedIn show no title or image, and [LCP](/observability/web-vitals/) (the moment the main content appears) is poor on mobile. What would you change?

<details>
<summary>Answer</summary>

Content that must be found and shared has to be **in the HTML**. Link-preview bots read only the HTML, so they see the empty shell. And CSR shows content only after the JavaScript loads, runs and fetches data, which is why LCP is late.

A blog is a **document**, the same for every reader, and changes rarely: generate it **statically** (SSG: HTML produced once at build time), and regenerate a post when it is published ([CMS publishing](/data/cms/#drafts-preview-and-publishing)). The few interactive parts (comments, a search box) can be islands (small interactive parts that get JavaScript while the rest stays static HTML) or client components. The cost is a build step and a publish hook, which is small for this kind of site.

</details>

## 2. One product page, several kinds of data

An online shop's product page has a description and photos (the same for everyone), personal prices for logged-in business customers, and a cart badge. Product wants it fast and indexable. Which rendering do you choose?

<details>
<summary>Answer</summary>

Not one label for the whole page. Decide **per part**:

- Description and photos: public, rarely changed, must be indexed. Prerender them (SSG, or ISR: static pages regenerated in the background; or a cached static shell, the part of the page that is the same for everyone) and serve them from a [CDN](/web-platform/cdn/) (servers near users that keep copies).
- Personal price and cart: personal, must never reach a shared cache. Stream them per request into placeholders, or fetch them in the browser.

The public shell gives fast first content and full HTML for search engines; the personal parts arrive a moment later. The trade-off is more moving parts and a short placeholder state, against a fully per-request page that waits for its slowest data and can't be cached.

</details>

## 3. Looks ready, does nothing

After moving to SSR (rendering the HTML on the server for each request), a page shows its content quickly. But on mid-range phones, tapping the filter buttons does nothing for about three seconds after the content appears. Why, and what can help?

<details>
<summary>Answer</summary>

The page is in the gap before **hydration** finishes: the HTML is visible, but the JavaScript for the whole page still has to download, run every component again and attach the handlers. SSR improved first content, but it ships the same JavaScript, so the page isn't usable any sooner. This is a usability failure even if the measured INP (the delay from an input to the next paint) looks fine, because a button without a handler can still paint quickly; the hydration work on the [main thread](/web-platform/browser-execution/#mental-model-one-worker-one-queue-of-jobs) can also make INP worse, so measure both.

Options: send less JavaScript (split code, remove heavy dependencies); hydrate less, with [Server Components](/tools/react/server-components/) (components that run only on the server and send no JavaScript) for parts that only render, or islands; let React hydrate [`<Suspense>`](/tools/react/suspense/) boundaries (parts of the page that can load and hydrate on their own) separately, so the filter area can hydrate first. Native elements (links, forms) work before hydration, so a filter built as a form with a URL keeps working even before the JavaScript arrives.

</details>

## 4. One slow widget delays the whole page

A server-rendered dashboard has six widgets. One of them, "recommendations", calls a service that takes 3 seconds. Every visit waits 3 seconds for the first byte. What would you do?

<details>
<summary>Answer</summary>

**Stream** the page: send the shell and the five fast widgets at once, with a placeholder for recommendations, and send that part later in the same response when it is ready. In React, a `<Suspense>` boundary around the slow widget marks where the page can be split.

Check that nothing between the server and the user (a proxy, a CDN) buffers the whole response, or streaming stops working. Alternatives: load the slow widget in the browser after the page is shown, or cache its data. Also ask whether 3 seconds is acceptable at all for that service; streaming hides slowness, it doesn't remove it.

</details>

## 5. A 404 that comes back as 200

A streamed product page checks whether the product exists inside a component deep in the page. For a deleted product, users see a "Not found" message, but the response status is `200`, and search engines keep the deleted page in the index. Why?

<details>
<summary>Answer</summary>

With streaming, the **status code and headers go out with the first piece**. When the deep component discovers the product doesn't exist, the `200` has already been sent, so the server can only render a message.

Check existence **before streaming starts**: at the top of the route, in the data loading for the page, or with the framework's mechanism for "not found" that runs before the shell is sent. Then the server can return a real `404` (or a redirect). Keep the slow, optional parts inside streamed boundaries, and the checks that decide the status outside them.

</details>

## 6. "Last updated 5 minutes ago"

A page shows "Last updated 5 minutes ago", computed during render. The console shows a hydration mismatch warning, and the text sometimes flickers. What is the cause, and how do you fix it?

<details>
<summary>Answer</summary>

The server rendered "5 minutes ago" at one moment, and the browser rendered again during hydration at a later moment, possibly in another time zone, and got a different text. Hydration expects the browser's first render to match the server HTML; when it doesn't, React warns and patches or re-renders.

Options: render a stable value on the server (an absolute date in a fixed format) and switch to the relative text after hydration (in an effect); or render the time only on the client. Avoid anything time-dependent, random or `window`-dependent in the first browser render of components whose HTML was already rendered on the server.

</details>
