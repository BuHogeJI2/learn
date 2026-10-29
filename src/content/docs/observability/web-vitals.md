---
title: Web Vitals
description: The user-centered speed metrics — LCP, INP and CLS, plus TTFB and FCP for diagnosis — what each measures, the thresholds, lab versus field data, and the usual causes and fixes.
related:
  - web-platform/page-loading
  - architecture/rendering
  - observability/logs-metrics-traces
officialDocs:
  - title: web.dev — Web Vitals
    url: https://web.dev/articles/vitals
  - title: web.dev — Largest Contentful Paint (LCP)
    url: https://web.dev/articles/lcp
  - title: web.dev — Interaction to Next Paint (INP)
    url: https://web.dev/articles/inp
  - title: web.dev — Cumulative Layout Shift (CLS)
    url: https://web.dev/articles/cls
  - title: Chrome for Developers — Chrome UX Report
    url: https://developer.chrome.com/docs/crux
  - title: GitHub — web-vitals library
    url: https://github.com/GoogleChrome/web-vitals
  - title: web.dev — LCP and INP are now Baseline Newly available
    url: https://web.dev/blog/lcp-and-inp-are-now-baseline-newly-available
  - title: web.dev — Experimental soft navigation metrics in CrUX
    url: https://web.dev/blog/crux-experimental-soft-navs
---

## What problem it solves

"The site is slow" can mean many things: the page appears late, clicks feel sluggish, or content jumps while you read. Teams need a small set of metrics that reflect what users feel, that can be measured on real devices, and that point toward a cause.

**Web Vitals** is Google's set of such metrics. The three most important are the **Core Web Vitals**. [How a browser loads a page](/web-platform/page-loading/#how-the-steps-map-to-metrics) shows which loading steps drive each metric; this page is about the metrics themselves: what they measure, how they are judged and how to improve them.

## Mental model: three questions about real visits

| Metric | Question | Good | Poor | What is measured |
| --- | --- | --- | --- | --- |
| **LCP** (Largest Contentful Paint) | When did the main content appear? | ≤ 2.5 s | > 4 s | Time from the start of navigation until the largest image or text block in the viewport is rendered |
| **INP** (Interaction to Next Paint) | When I click, tap or type, how fast does the screen respond? | ≤ 200 ms | > 500 ms | Time from an interaction until the next frame is painted, for (nearly) the slowest interaction of the visit |
| **CLS** (Cumulative Layout Shift) | Does content jump around? | ≤ 0.1 | > 0.25 | A score for unexpected movement of visible content, from the worst burst of shifts |

Values between "good" and "poor" are "needs improvement". Two rules decide the verdict:

- **The 75th percentile**: for each metric separately, take the value that 75% of measured visits match or beat; that value must be in the "good" range. A page passes the Core Web Vitals assessment when all three metrics pass.
- **Mobile and desktop are judged separately**, because devices and networks differ so much.

Two more metrics help to **diagnose** LCP: **TTFB** (time to first byte, good ≤ 0.8 s) and **FCP** (first contentful paint, good ≤ 1.8 s). A lab test that only loads the page has no interactions, so tools such as Lighthouse use **TBT** (Total Blocking Time: the total time during loading when long tasks blocked the main thread) as a stand-in for INP. A lab test that performs interactions, in DevTools or a scripted flow, can measure INP directly.

INP replaced the older FID (First Input Delay) in March 2024. FID measured only the waiting time before the *first* interaction; INP covers every click, tap and key press (not scrolling or hovering) and the whole time until the screen updates; a visit without such interactions has no INP value.

## How each metric works

### LCP: when the main content appears

- **Candidates**: images (including CSS background images loaded by URL), videos (their poster image or first frame, whichever appears first) and blocks of text. The browser updates the candidate as larger elements render, and stops at the first user input or scroll.
- **The four parts of LCP**: TTFB → **load delay** (until the browser starts downloading the LCP resource) → **load duration** → **render delay**. Measure which part is big, and fix that one. For a text LCP without a web font, the two load parts can be zero.
- **Usual causes**: a slow server or a far-away one ([CDN](/web-platform/cdn/): servers near users remove the distance); an LCP image found late because it is a CSS background, rendered by JavaScript or lazy-loaded; large unoptimized images; render-blocking CSS and scripts; content that only appears after client-side rendering ([rendering strategies](/architecture/rendering/)).

### INP: how fast the page reacts

An interaction's latency has three parts:

```
click ──► input delay ──► processing ──► presentation delay ──► next frame painted
          (main thread     (your event     (style, layout,
           busy elsewhere)  handlers)       paint)
```

- The reported INP is the slowest interaction of the visit; on pages with very many interactions, one outlier per 50 interactions is ignored.
- **Usual causes**: **long tasks** (any work, such as JavaScript or layout, that blocks the main thread for more than 50 ms) from [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready), heavy third-party scripts or large re-renders; slow event handlers; a huge DOM that is expensive to update.
- **Fixes**: split long tasks and yield to the browser between the pieces; show feedback right away and do the heavy work after the next frame; re-render less; move heavy computation to a web worker; ship and run less JavaScript.

### CLS: how stable the layout is

- Each unexpected shift gets a score from **how much of the screen moved** and **how far it moved**. Shifts within half a second after a discrete input (a click, a tap, a key press) don't count, because the user expects them. Scrolling and other continuous gestures don't get this exception, so content that jumps in while the user scrolls does count.
- Shifts are grouped into bursts (gaps under 1 second, at most 5 seconds per burst), and CLS is the score of the **worst burst**.
- **Usual causes**: images, videos, iframes and ads without reserved space; web fonts that change the text size when they arrive; banners or cookie notices inserted above content; animations of `top` or `height` instead of `transform`.
- **Fixes**: `width` and `height` or `aspect-ratio` on media; reserved slots for ads and embeds; font fallbacks tuned to the web font's size; new content added below the current view or as an overlay; animating `transform`.

## Lab data and field data

| | Lab data | Field data (real-user monitoring) |
| --- | --- | --- |
| Source | One test run on a chosen device and network | Real visits, on real devices and networks |
| Good for | Debugging, comparing builds, catching regressions in [CI](/delivery/ci-cd/) | Knowing what users actually experience; the official verdict |
| INP | Only in tests that perform interactions; load-only audits use TBT | Measured |
| Tools | Lighthouse, WebPageTest, the DevTools Performance panel | CrUX, your own RUM (real-user monitoring) through the `web-vitals` library |

- **CrUX** (Chrome UX Report) is Google's public field dataset, from Chrome users who opted in. PageSpeed Insights, Search Console and the CrUX API show a rolling 28-day window; the BigQuery dataset is published monthly per origin. It only covers Chrome, and only pages and sites that are publicly discoverable and have enough traffic.
- **Your own RUM** covers every page you care about. The `web-vitals` library implements the metric definitions as far as browser APIs allow; it can't see inside iframes, which CrUX does include, so the two can differ. It reports a metric when the page is hidden, and INP and CLS may be reported again if the visit continues: keep the latest value per metric ID instead of counting each report as a visit. A page restored from the back/forward cache gets new measurements with new IDs. Its "attribution" build says *why*: the LCP element, the slow interaction and its three parts, the element that shifted. Send the values to your analytics or monitoring ([what to measure](/observability/logs-metrics-traces/#what-to-measure)) and segment by page type, device and country.
- **Browser support.** Since Safari 26.2 (December 2025), LCP and INP can be measured in the current versions of all major browsers. CLS is still measured only in Chromium-based browsers.
- **Single-page apps.** By default, these metrics are tied to full page loads. A client-side route change doesn't start a new measurement: the page's INP and CLS keep covering the whole visit (its slowest interaction and its worst burst of shifts), and a new route's main content has no LCP of its own. This is changing: Chrome 151 added APIs that measure **soft navigations** (route changes inside a single-page app), and since October 2026 CrUX publishes experimental soft-navigation versions of the three metrics next to the stable ones. The stable assessment doesn't use them yet.
- **Lab and field often disagree.** The lab runs one controlled visit under chosen conditions; the field includes slow phones, full caches, logged-in states and real clicks. Trust the field for the verdict, and use the lab to find causes.

## Typical failures

- **Chasing the Lighthouse score** while field data stays poor, or the reverse.
- **A lazy-loaded LCP image**, or an LCP image hidden in a CSS background.
- **Averages instead of the 75th percentile**, and mobile and desktop mixed together.
- **Testing only on fast office laptops.**
- **Good LCP but poor INP** because hydration and third-party scripts keep the main thread busy.
- **Third-party scripts**: tag managers, chat widgets, and A/B testing tools whose "anti-flicker" snippet hides the page until they load.
- **Cookie banners** that push content down (CLS) or become the LCP element.
- **Expecting CrUX data for low-traffic pages.** There is none; you need your own RUM.
- **Optimizing only for search ranking.** Core Web Vitals are one ranking signal among many; the bigger payoff is users who stay and buy.

## When to care, and how to work

- **Public content and commerce sites:** high priority. Speed affects conversion, and the metrics feed into search ranking.
- **Apps behind login and dashboards:** INP matters most. LCP matters less for returning users with warm caches, and CrUX often has no data, so your own RUM is essential.
- **A working loop:** field data shows which metric fails on which pages → lab tools and attribution find the cause → fix it → watch the field data over the next weeks.

## Landscape

- **Google tools:** PageSpeed Insights, CrUX (dashboard, API, BigQuery), the Core Web Vitals report in Search Console, Lighthouse, the Chrome DevTools Performance panel with live metrics.
- **Measurement library:** `web-vitals`.
- **Real-user monitoring:** Vercel Speed Insights, Sentry, Datadog RUM, SpeedCurve, DebugBear, Cloudflare Web Analytics, New Relic.
- **Lab and CI:** WebPageTest, Lighthouse CI.
