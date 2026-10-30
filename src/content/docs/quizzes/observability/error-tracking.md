---
title: Error tracking — check yourself
description: Scenario questions about source maps, browser noise, unreported failures, grouping and privacy.
quizFor: observability/error-tracking
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Stack traces nobody can read

The error tracker shows frontend errors like `TypeError: e is undefined at main.3f9a.js:1:48213`. The team does upload source maps (files that map minified code back to the original source), in a separate job that runs after the deploy. What is going wrong?

<details>
<summary>Answer</summary>

Two likely problems:

- **Timing**: events that arrive before the source maps are uploaded are not remapped later, so the first minutes or hours of a release, often the most important ones, stay unreadable.
- **Matching**: the maps must belong to the exact files that were deployed. If the upload job builds again, the files and maps can differ. Current tools embed a **debug ID** in each file and its map, which makes the match exact; older setups match by release name.

Upload the maps in the same [CI build](/delivery/ci-cd/) that produces the deployed files, before that build starts serving users, and tag every event with the release. Usually don't serve the maps publicly.

</details>

## 2. Thousands of "Script error."

The tracker's top issue is "Script error." with no stack trace, thousands of times a day. The app loads its own bundle from a [CDN](/web-platform/cdn/) domain and a few third-party scripts. What is this, and what do you do?

<details>
<summary>Answer</summary>

When a script from **another [origin](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access)** (a different scheme, host or port) throws, the browser hides the details for security and reports only "Script error.". Your bundle on the CDN domain counts as another origin too.

For your own scripts: load them with the `crossorigin` attribute and serve them with a matching [CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read) header (`Access-Control-Allow-Origin`, the server's permission for another origin to read it), so the details become visible. For third parties you can't change, filter or tag the noise, but check the impact first: if a third-party script your checkout needs is failing, that is a real problem, not noise.

</details>

## 3. Checkout fails, the tracker is quiet

Users report that payment sometimes fails with "Something went wrong". The error tracker shows nothing for checkout. The code calls `fetch('/api/pay')`, and on a non-OK response shows the message inside a `try/catch`. Why is the tracker quiet?

<details>
<summary>Answer</summary>

The SDK (the tracker's library inside your app) captures **uncaught** exceptions and unhandled promise rejections automatically. Here nothing is uncaught: `fetch` resolves normally on a `500` response, and the code handles it by showing a message. Errors your code catches, and failures that don't throw at all, are invisible unless you report them.

Report the failures that matter **deliberately**: when the payment call fails, send an event (or a message) with the status, the endpoint and the trace ID (the ID that ties one request's operations together, see [traces](/observability/logs-metrics-traces/#connecting-the-signals)). It links to the backend spans if the backend is instrumented, the trace context was passed along with the request, and that trace was kept by sampling. Don't report every expected validation error; report what means the user couldn't do what they came for.

</details>

## 4. One bug, eight hundred issues

After a release, the tracker shows 800 new issues (groups of events it believes are the same problem): "Order 1042 not found", "Order 1043 not found", and so on, each with a few events. The team can't see how big the problem is. What is happening?

<details>
<summary>Answer</summary>

**Grouping** went wrong. The **fingerprint** (what the tracker uses to decide that events are the same problem) includes the message, and the message contains an ID, so every order creates a new issue. One bug is split into hundreds, and its real size (how many events, how many users) is hidden.

Remove variable data from the error message (put the order ID in a tag or extra context instead), or adjust the fingerprint rules to group by the error type and stack trace. The opposite mistake exists too: grouping that is too broad merges different bugs into one issue.

</details>

## 5. Session replay on the payment form

The team turns on session replay (a recording of what the user saw: DOM changes, clicks and network calls) to debug checkout. A week later, someone notices that replays show the full card holder name, address and email typed into the form. What should have been set up?

<details>
<summary>Answer</summary>

Replays and error events can capture personal data: form values, URLs with tokens, request bodies. **Mask text and inputs by default**, and unmask only specific elements you know are safe. Replays and error events have separate privacy settings, so check both, and look at real outgoing data in a test before turning collection on in production.

Also decide **retention** (how long replays are kept), sample replays rather than recording every session, and check what your privacy policy and laws such as GDPR allow. Delete the replays already recorded with unmasked data.

</details>
