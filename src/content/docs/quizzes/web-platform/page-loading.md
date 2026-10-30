---
title: How a browser loads a page — check yourself
description: Scenario questions about reading the waterfall and finding the slow step.
quizFor: web-platform/page-loading
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A smaller bundle didn't help

The home page feels slow. The team spent a week cutting the JavaScript bundle by 30%, and nothing changed for users. In the Network tab, the HTML document request spends 1.8 seconds in "Waiting (TTFB)" (the time from sending the request until the first byte of the response arrives). What went wrong, and where should they look now?

<details>
<summary>Answer</summary>

They optimized the wrong step. The browser can't render anything before the HTML arrives, and it learns about most resources only from that HTML (apart from hints such as `103 Early Hints`). So here, 1.8 seconds is a floor under first content and LCP. Bundle size matters only after that.

"Waiting" is one round trip (the time for a request to reach the server and come back) plus **server time**. Next steps: check the server's own timing (slow database queries, calls to other services, rendering on every request) with [traces](/observability/logs-metrics-traces/) (a timeline of one request through your services), and check distance: is there a [CDN](/web-platform/cdn/) (servers near users that keep copies and handle connections) close to them? Fixes depend on the cause: cache the page or its data, [stream the HTML](/architecture/rendering/#streaming) so the browser can start early, or move the work closer to users. The lesson: read the waterfall before you choose the fix.

</details>

## 2. The hero image comes last

LCP (the moment the main content appears) is poor. The waterfall (the request timeline in the Network tab) shows the HTML, then the CSS and the JS bundle, and only after the JS finishes, the request for the big hero image. The image is set as a CSS background by a component. How do you fix it?

<details>
<summary>Answer</summary>

The image is **discovered late**. The preload scanner reads only the HTML, so it can't see an image that appears in CSS or is rendered by JavaScript. The request starts only after the CSS and JS are loaded and run.

Make it visible early: put a real `<img>` in the server HTML (or a `<link rel="preload" as="image">` if it must stay a background), add `fetchpriority="high"`, and make sure it doesn't have `loading="lazy"`. The trade-off is small: you decide in the HTML which image is the most important, instead of letting the component decide at runtime.

</details>

## 3. A staircase in the waterfall

A single-page app loads like this: HTML → `main.js` → a route chunk → a JSON request → the product images. Each request starts only after the previous one ends. On a mobile network the page takes 4 seconds. What are your options?

<details>
<summary>Answer</summary>

This is a **request chain**: each step needs a full round trip, and on mobile a round trip can be 100 ms or more, plus download time. The cost is the length of the chain, not the size of any one file.

Options, from cheap to bigger:

- `preload` or `modulepreload` the route chunk, and start the data request in parallel with the code (not inside a component after it mounts).
- Flatten imports so the route chunk isn't found only after `main.js` runs.
- Render on the server: the HTML then already contains the data and the image URLs, so the preload scanner finds the images at once. This removes the chain, but moves work to the server: if the server or its data is slow, TTFB grows. It changes your [rendering strategy](/architecture/rendering/), the biggest change of the three, so measure before and after.

</details>

## 4. Lighthouse says 98, users say "slow"

Lighthouse on a developer laptop gives the page 98. But the field data in Search Console shows poor [INP](/observability/web-vitals/#inp-how-fast-the-page-reacts) (how fast the page reacts to input) for mobile users. Who is right?

<details>
<summary>Answer</summary>

Both measure something real, but the field data decides what users feel. Lighthouse is a **lab** test: one simulated load, on one machine, with no real interactions, so it can't measure INP at all. Real users have mid-range phones, where the same JavaScript runs several times slower, and they click while scripts are still running.

Poor INP points to step 7: JavaScript on the **main thread**. Look for long tasks in the Performance panel with CPU throttling on, and for heavy event handlers, third-party scripts and expensive [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready) (the framework running components again in the browser to attach handlers to server-rendered HTML). Use lab tools to debug, field data to decide.

</details>

## 5. A chat widget in `<head>`

Marketing adds a chat widget as a classic `<script src="https://chat.vendor.example/widget.js">` in `<head>`. FCP (the first text or image on screen) gets 600 ms worse. Why, and what can you do without removing the widget?

<details>
<summary>Answer</summary>

A classic script **blocks the parser**: the browser stops building the page, connects to a new origin (DNS, TCP, TLS), downloads the script and runs it before it continues. Every user waits for a third-party server.

Options:

- `defer`: the script downloads in parallel and runs after parsing, so it doesn't block it. Usually the best choice.
- `async`: downloads in parallel, but runs as soon as it arrives, in any order, and still pauses parsing while it runs.
- Moving the script to the end of the body lets the content above it be parsed and shown first, but parsing still waits for the script there.
- Load it later: after the page becomes idle, or only when the user clicks a "Chat" button (a facade: show a static button, load the real widget on demand).
- `preconnect` to the vendor origin if it must load early.

The trade-off: the widget becomes available a bit later. For a chat, that is almost always the right choice.

</details>

## 6. Four redirects before the page

Links in a mobile ad campaign point to `http://shop.example/promo`. The user reaches `https://www.shop.example/en/promo` after several hops. What does this cost, and how do you fix it?

<details>
<summary>Answer</summary>

Each redirect is a **full extra request** before any content: `http://` → `https://` → `www.` → `/en/`. Some hops also need a new DNS lookup and new TCP and TLS handshakes. On a mobile network this can add a second before the first byte of the real page.

Fixes: link to the final URL in campaigns, collapse the rules so that any old URL redirects in **one hop** to the final one, and use HSTS (a header that tells browsers to use only HTTPS for your domain) so browsers skip the `http://` step on later visits.

</details>
