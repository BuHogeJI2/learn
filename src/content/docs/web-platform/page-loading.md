---
title: How a browser loads a page
description: The journey from a typed URL to pixels on screen, and how to read it in the Network tab.
related:
  - web-platform/http
  - architecture/rendering
  - web-platform/cdn
officialDocs:
  - title: MDN — How browsers work
    url: https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work
  - title: MDN — Critical rendering path
    url: https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Critical_rendering_path
  - title: web.dev — Don't fight the browser preload scanner
    url: https://web.dev/articles/preload-scanner
  - title: web.dev — Web Vitals
    url: https://web.dev/articles/vitals
  - title: web.dev — Optimize Largest Contentful Paint
    url: https://web.dev/articles/optimize-lcp
  - title: Chrome DevTools — Network features reference
    url: https://developer.chrome.com/docs/devtools/network/reference
---

## What problem it solves

Between pressing Enter and seeing a page, about a dozen steps happen, and any of them can be the slow one. If you know the sequence, a slow page stops being a mystery: you can read the Network tab, find the step that takes the time, and pick the right fix. Without it, people optimize the bundle size when the server is the problem, or the server when a script blocks rendering.

## The journey

```
 URL entered
   │
 1 ├─ Can we skip the network?  HTTP cache, service worker, back/forward cache, prerender
 2 ├─ DNS lookup                name → IP address
 3 ├─ Connection                TCP + TLS handshakes (or QUIC for HTTP/3)
 4 ├─ Request → server works    first byte of HTML arrives (TTFB)
 5 ├─ HTML is parsed as it streams in → DOM
 │     ├─ CSS found     → download, build CSSOM      (blocks rendering)
 │     ├─ <script> found → download, maybe run        (may block the parser)
 │     └─ images, fonts  → download in parallel
 6 ├─ Style → Layout → Paint → Composite              first pixels (FCP), main content (LCP)
 7 └─ JavaScript runs, handlers attach                 page responds to input (INP)
```

**1. Skip the network.** The fastest request is the one never sent. The browser checks its HTTP cache (see [Caching](/architecture/caching/)), a service worker may answer, the back/forward cache can restore a whole page instantly, and a page that was **prerendered** in advance (with the Speculation Rules API) shows up at once.

**2. DNS.** The domain name is turned into an IP address. Answers are cached by the browser and the operating system, so this costs time mostly on a first visit: from a few milliseconds to over 100 ms.

**3. Connection.** For HTTP/1.1 and HTTP/2 the browser opens a TCP connection (one round trip) and then does a TLS handshake (one more round trip with TLS 1.3). HTTP/3 runs over QUIC, which combines both into one round trip. Each **round trip** (RTT, the time for a packet to go to the server and back) is the unit that matters: on a mobile network it can be 100 ms or more, so three round trips before the first request is already a noticeable delay. This is the main reason a [CDN](/web-platform/cdn/) helps even for content that can't be cached: the handshakes happen with a nearby server. See [HTTP versions](/web-platform/http/#http-versions-same-meaning-different-transport).

**4. Request and server time.** The browser sends the request and waits. **TTFB** (Time To First Byte) for a page is measured from the start of navigation to the first byte of the HTML. It includes redirects, DNS, the connection and everything the server does (database queries, rendering). Every redirect adds a full extra request. The DevTools "Waiting (TTFB)" phase is narrower: only the time after the request was sent.

**5. Parsing.** The browser doesn't wait for the whole HTML file; it parses it as it arrives and builds the **DOM** (the tree of elements). Along the way:

- **CSS blocks rendering.** The browser won't paint until it has the CSS it found, to avoid showing unstyled content. It builds the **CSSOM** (the tree of styles).
- **A classic `<script>` blocks the parser.** The parser stops, downloads the script, runs it, and only then continues, because the script might change the document. `defer` and `type="module"` (deferred by default) download in parallel and run after parsing, in order: no block. `async` downloads in parallel but runs as soon as it arrives, in any order; while it runs, it still stops the parser.
- **The preload scanner** is a second, lightweight parser that looks ahead in the raw HTML and starts downloading resources early, even while the main parser is blocked. It only sees what is written in the HTML. Resources it **can't see** are found late: background images in CSS, scripts and images added by JavaScript, fonts referenced from CSS, and `@import` inside CSS.

**6. Rendering.** The browser calculates styles, does **layout** (the size and position of every box), **paints** pixels, and **composites** layers on the GPU. When the DOM or sizes change later, layout runs again; content that moves after it was shown is a **layout shift**.

**7. Interactivity.** JavaScript runs on the **main thread**, the same thread that handles input and rendering. While a long script runs, clicks wait. For server-rendered pages, the HTML can be visible long before its JavaScript is ready; see [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready).

### How the steps map to metrics

| Metric | Measures | Mostly decided by steps |
| --- | --- | --- |
| TTFB | First byte of the HTML | 2–4: DNS, connection, server |
| FCP (First Contentful Paint) | First text or image on screen | 4–6 |
| **LCP** (Largest Contentful Paint) | The main content, such as the hero image or headline | 4–6, especially late discovery |
| **CLS** (Cumulative Layout Shift) | How much content jumps around | 6 |
| **INP** (Interaction to Next Paint) | How fast the page reacts to input | 7 |

The bold three are the **Core Web Vitals**, the metrics Google uses to judge real-user experience.

## Reading the Network tab

The Network tab in the browser DevTools shows every request on a timeline (the **waterfall**). The columns that answer the most questions:

- **Initiator**: who asked for this file. It shows **chains**: HTML → CSS → font, or JS → JS → JSON.
- **Size**: transferred size, or `(memory cache)`, `(disk cache)`, `(ServiceWorker)` when no network was used.
- **Protocol** (right-click the header to enable it): `h2`, `h3`.
- **Priority**: how important the browser thinks the request is.

Click a request and open **Timing** to see its phases:

| Phase | What it means |
| --- | --- |
| Queueing, Stalled | Waiting to start: lower priority, or the six-connection limit of HTTP/1.1 |
| DNS Lookup | Resolving the name |
| Initial connection, SSL | TCP and TLS handshakes |
| Request sent | Sending the request |
| Waiting (TTFB) | One round trip plus server time |
| Content Download | Receiving the body |

### Patterns and what they mean

| What you see | Likely cause | Direction of the fix |
| --- | --- | --- |
| Long "Waiting" on the HTML document | Slow server or far away | Caching, CDN, streaming the HTML |
| A staircase: each file starts only after another ends | Request chain from late discovery | Put resources in the HTML, `preload`, flatten imports |
| Many requests "Queueing" or "Stalled" | HTTP/1.1 limit or low priority | HTTP/2, fewer requests, priorities |
| Long "Content Download" | Large files | Compression, smaller images, code splitting |
| A gap between the HTML and the LCP image request | LCP image found late (CSS background, rendered by JS) | Put the image in the HTML, `fetchpriority="high"` |
| Network quiet, but the page reacts slowly | JavaScript on the main thread | Look in the Performance tab, not Network |

Useful switches: **Disable cache** (to see a first visit), **throttling** (to simulate a slow network), and **Preserve log** (to keep requests across redirects).

## Levers: what you can change

| Goal | Levers |
| --- | --- |
| Fewer round trips | A CDN near users; no redirect chains; HTTP/3; `preconnect` to important third-party origins |
| Earlier discovery | Resources in the HTML; `<link rel="preload">`; `103 Early Hints` |
| Right priority | `fetchpriority="high"` for the LCP image, `"low"` for less important files; no `loading="lazy"` on the LCP image |
| Fewer bytes | Brotli or Zstandard compression; AVIF and WebP images; code splitting |
| Less blocking | `defer` / `async` scripts; small critical CSS; `font-display` for web fonts |
| Faster server | Caching; [streaming the HTML](/architecture/rendering/#streaming) so the browser can start early |
| No network at all | HTTP cache headers; back/forward cache; service worker; prerendering likely next pages |

## Typical failures

- **Optimizing the wrong step.** Shrinking the bundle doesn't help when TTFB is two seconds. Look at the waterfall first.
- **Render-blocking third-party scripts.** A tag manager or chat widget as a classic script in `<head>` delays everything.
- **A lazy-loaded hero image.** `loading="lazy"` on the LCP image delays the most important element.
- **Redirect chains.** `http://` → `https://` → `www.` → `/en/`: each step is a full round trip before any content.
- **Images and embeds without reserved space.** Missing `width`/`height` or aspect ratio makes content jump when they load (CLS).
- **Testing only on a fast laptop with fast Wi-Fi.** Lab tests are useful for debugging, but real users on mid-range phones decide the result. Compare with **field data** from real users.

## When this knowledge pays off

- Any performance investigation: it tells you which step to measure.
- Choosing a [rendering strategy](/architecture/rendering/): each strategy moves work between steps 4, 5 and 7.
- Reviewing third-party scripts, fonts and images before they are added.
- Reading Lighthouse or PageSpeed reports: every audit maps to one of the steps above.

## Landscape

- **Browser tools:** DevTools Network and Performance panels, Lighthouse.
- **Lab testing:** WebPageTest (filmstrips, waterfalls, real devices and locations), PageSpeed Insights.
- **Field data:** Chrome UX Report (CrUX), and [real-user monitoring](/observability/logs-metrics-traces/) (RUM) tools such as Vercel Speed Insights, Sentry, SpeedCurve, or the `web-vitals` library sending data to your own analytics.
