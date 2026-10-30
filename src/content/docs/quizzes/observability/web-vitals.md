---
title: Web Vitals — check yourself
description: Scenario questions about reading LCP, INP and CLS, and about field data versus lab data.
quizFor: observability/web-vitals
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Where does the LCP time go?

On mobile, the product page's LCP (the moment the main content, here the product photo, is rendered) is 4.2 s at the 75th percentile. Field data (measured on real users' devices) with attribution (the library's breakdown of why a value is what it is) splits it like this: TTFB (time until the first byte of the HTML) 0.6 s, load delay 2.4 s, load duration 0.7 s, render delay 0.5 s. What does this tell you, and where do you look?

<details>
<summary>Answer</summary>

The big part is the **load delay**: 2.4 seconds pass after the HTML arrives before the browser even **starts** downloading the photo. The server (TTFB) and the download itself are fine, so a faster server or a smaller image would help little.

A long load delay means the image is **discovered late** or given low priority: it is a CSS background, rendered by JavaScript after hydration, lazy-loaded, or behind other requests. Put a real `<img>` in the server HTML, add `fetchpriority="high"`, remove `loading="lazy"` from it, or preload it ([page loading](/web-platform/page-loading/#patterns-and-what-they-mean)). Then check the field data again over the next weeks.

</details>

## 2. Content that jumps

CLS (a score for how much visible content moves unexpectedly) is 0.32 on article pages. Users complain that they click the wrong link. The page has a cookie banner, an ad slot between paragraphs and a web font. What are the likely causes, and the fixes?

<details>
<summary>Answer</summary>

All three are classic causes:

- **The ad slot** has no reserved size, so the text below it jumps down when the ad loads. Reserve the slot's space (a minimum height for the usual ad size), and accept some empty space if no ad fills it.
- **The cookie banner** is inserted at the top and pushes content down. Show it as an overlay at the bottom instead.
- **The web font** has a different size than the fallback font, so lines rewrap when it arrives. Tune the fallback to the web font's size (`size-adjust` and similar), or preload the font.

Shifts within half a second after a click or key press don't count, but these happen on their own, while the user is reading or scrolling, so they do.

</details>

## 3. A slow filter click

INP (how fast the page responds to clicks, taps and typing; good is 200 ms or less) is 600 ms on a product list. The slowest interaction is clicking a filter checkbox: the handler filters 5,000 items and re-renders the whole list. What can you do?

<details>
<summary>Answer</summary>

The work is a **[long task](/web-platform/browser-execution/#long-tasks-and-what-users-feel)** (work that blocks the main thread, the one that also handles input and painting, for more than 50 ms): until it ends, the browser can't paint the checked box or anything else.

Options:

- **Show feedback first**: update the checkbox as an urgent update, and render the filtered list as a non-urgent one, for example with a React [transition](/tools/react/suspense/#updates-transitions-keep-what-is-already-shown), which React can interrupt to paint and handle input. A transition doesn't make synchronous code faster: if the filtering itself is one long calculation, it still blocks, so split it, yield to the browser, or move it to a worker.
- **Split the work** into smaller pieces and yield between them, so the browser can paint and handle other input.
- **Do less**: re-render only the changed rows, virtualize the list (render only visible items), or filter on the server.
- **Move pure computation** to a web worker (a background thread without access to the page); only the result comes back to the main thread.

Measure on a mid-range phone with CPU throttling: a fast laptop hides the problem.

</details>

## 4. Our numbers vs Google's numbers

The team built its own RUM (real-user monitoring) with the `web-vitals` library. Their dashboard shows an average INP of 120 ms, but Search Console marks the same pages "poor" for INP on mobile. They sent every value the library reported to their analytics, for mobile and desktop together. Why do the numbers disagree?

<details>
<summary>Answer</summary>

Several mistakes add up:

- **Average instead of the 75th percentile.** The verdict uses p75 of visits (the value that 75% of visits match or beat); an average hides the slow quarter.
- **Mobile and desktop mixed.** They are judged separately, and fast desktops pull the number down.
- **Counting reports as visits.** The library reports INP and CLS again when the visit continues; keep the latest value per metric ID instead of counting each report.

Also expect real differences: CrUX (Google's public dataset of [field data](/observability/web-vitals/#lab-data-and-field-data)) covers only Chrome users who opted in, over 28 days, and includes iframes, which the library can't see. Fix the aggregation first, then compare.

</details>

## 5. An SPA with one LCP per visit

In a single-page app, the RUM dashboard shows LCP only for the first page of each visit, and INP for the whole visit, even though users move through ten routes. The team thinks the integration is broken. Is it?

<details>
<summary>Answer</summary>

No, that is how the metrics are defined. They are tied to **full page loads**: a client-side route change doesn't start a new measurement, so a new route's main content has no LCP of its own, and INP and CLS keep covering the whole visit (its nearly slowest interaction, ignoring one outlier per 50 interactions, and its worst burst of shifts).

To see route-level performance, add your own measurements per route (time from the click to the route's main content), or use the newer measurements of soft navigations (route changes inside a single-page app): Chrome 151 added APIs for them, and CrUX publishes experimental soft-navigation metrics, but the official assessment doesn't use them yet. To segment INP by route, record the current route yourself when each interaction happens (or keep a timeline of route changes and match it with the interaction time from the attribution data). The attribution tells you the element and the time, not your router's route, and reading the URL only when the metric is reported can blame the last route for an earlier slow click.

</details>
