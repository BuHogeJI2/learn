---
title: Error tracking
description: What an error tracker does — capturing exceptions, grouping them into issues, source maps, releases, breadcrumbs, privacy and alerts — with Sentry as the main example and the traps specific to the browser.
related:
  - observability/logs-metrics-traces
  - observability/web-vitals
  - delivery/ci-cd
officialDocs:
  - title: Sentry — Key terms and concepts
    url: https://docs.sentry.io/concepts/key-terms/
  - title: Sentry — Issue grouping
    url: https://docs.sentry.io/concepts/data-management/event-grouping/
  - title: Sentry — Source maps for JavaScript
    url: https://docs.sentry.io/platforms/javascript/sourcemaps/
  - title: Sentry — Data collected and scrubbing
    url: https://docs.sentry.io/platforms/javascript/data-management/
  - title: MDN — crossorigin attribute
    url: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin
---

## What problem it solves

Errors happen in places you don't watch: in users' browsers, in rare code paths, on devices you never tested. Users rarely report them, and when they do, the report is "the button doesn't work". Logs alone don't help much: a busy service writes thousands of error lines, many of them the same problem, without the context needed to fix it.

An **error tracker** catches exceptions automatically, groups thousands of occurrences into a few **issues**, attaches the context a developer needs (stack trace in the original source, release, browser, what the user did before), and alerts the right people when something new or worse appears. It is the specialized signal next to [logs, metrics and traces](/observability/logs-metrics-traces/).

What is caught automatically has limits. The tracker's **SDK** (its library inside your app) captures **uncaught** exceptions and unhandled promise rejections. Errors your code catches, and failures that don't throw at all, need deliberate reporting: `fetch` resolves normally on a `500` response, so a failed checkout stays invisible unless your code reports it. Report the failures that matter, not every expected validation error.

## Mental model: events become issues

```
exception in a browser or server
   │  SDK captures it, adds context, applies configured scrubbing and sampling
   ▼
event ──► ingestion ──► fingerprint ──► issue "TypeError: x is undefined in Cart.tsx"
                                          · 1,240 events · 380 users
                                          · first seen in release 1.42.0
                                          · status: new / resolved / regressed
```

- **Event**: one occurrence of an error, with its stack trace and context.
- **Issue**: a group of events that the tracker believes are the same problem. Grouping uses a **fingerprint**, by default based on the stack trace (and the error type and message when needed).
- **Release**: the version of the code an event came from. Releases tie errors to [deploys](/delivery/deployment-models/#releasing-from-commit-to-users): "new in 1.42.0", "regressed in 1.43.0" (it came back after being marked as resolved).
- **Environment**: production, staging, preview.
- **Context**: browser and OS, URL, user ID, custom **tags** such as the plan or the [feature flag](/delivery/deployment-models/#releasing-from-commit-to-users).
- **Breadcrumbs**: a short trail of what happened before the error: clicks, navigations, network requests, console messages.

## What makes error data useful

- **Source maps.** Production JavaScript is minified, so a raw stack trace points to `main.3f9a.js:1:48213`. A **source map** maps it back to the original file and line. Upload source maps during the [CI build](/delivery/ci-cd/), before that build starts serving users: events that arrive earlier aren't remapped later. The maps must belong to the exact files that were deployed; current tools embed a **debug ID** in each file to match them (older setups match by release name). Usually *don't* serve the maps publicly. Without this step, frontend stack traces are nearly useless.
- **Releases and deploys.** Tag every event with the release and report each deploy to the tracker. "This issue started with release 1.42.0" is the fastest path from an error to its cause.
- **Grouping you can trust.** Good grouping turns 50,000 events into 12 issues. Bad grouping either merges different bugs into one issue or splits one bug into hundreds (for example, when the message contains an ID). Adjust the fingerprint rules when that happens.
- **User and business context.** The user ID (not the email), the page, the tenant (the customer organization), the feature flags. "Only users of the new checkout on Safari" is often the whole diagnosis.
- **Link to traces.** Modern trackers attach the trace ID, so you can jump from the error to the backend spans of the same request ([connecting the signals](/observability/logs-metrics-traces/#connecting-the-signals)), if the backend is instrumented, the trace context was passed along, and that trace was sampled and kept.
- **Session replay.** Some tools record what the user saw: the DOM changes, clicks and network calls, not a video. Very useful for "I can't reproduce it", and a privacy risk: mask text and inputs by default.

## Browser specifics

The browser is the noisiest place to collect errors:

- **"Script error."** When a script from another origin (a [CDN](/web-platform/cdn/), a third party) throws, the browser hides the details for security. To see them, load the script with the `crossorigin` attribute and serve it with a matching CORS header ([CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read)).
- **Noise**: errors from browser extensions, bots, and harmless browser warnings reported as errors. Filter known irrelevant noise, or it buries the real issues. But check the impact before dropping a whole category: an error in an older browser you support, or a blocked third-party script that your checkout needs, does break your app. When unsure, tag such errors instead of dropping them. (Filters by script URL look at the URLs in the stack trace, not the page URL.)
- **Network errors** ("Failed to fetch") are often the user's connection, but can also be a CORS problem or your server being down. Count them, and judge them by rate and by which requests fail.
- **Ad blockers** may block the tracker's own endpoint. Some teams send error data through their own domain (a "tunnel" or proxy).
- **Unhandled promise rejections** are errors too; make sure the SDK captures them, and that framework error boundaries (components that catch rendering errors in their part of the UI) report what they catch instead of swallowing it.

## Privacy and volume

- **Collect as little personal data as needed.** Error events can contain form values, URLs with tokens, request bodies and headers. Use the SDK's options to not send personal data by default, scrub fields such as `password` and `authorization`, and mask session replays. Error events and replays have separate privacy settings; check real outgoing events before turning collection on in production. Check what your privacy policy and laws such as GDPR allow.
- **Sample when volume is high.** Errors are usually kept in full, but performance traces and replays are sampled. A crash loop in a popular page can send millions of events; rate limits and quotas protect both the tracker and your bill.
- **Set retention**: how long events are kept, especially if they contain personal data.

## Alerts and workflow

- **Alert on what is new or changing**: a new issue in production, a resolved issue that came back (regressed), or a sudden rise in events or affected users. Alerting on every event creates noise that people learn to ignore.
- **Route issues to owners**: by code path or team, into the issue tracker or chat channel they actually read.
- **Triage regularly**: assign, resolve with the release that fixes it, or ignore on purpose with a reason. An inbox with 3,000 untouched issues means nobody looks at it.
- **Measure the observed impact**: the share of sessions without an unhandled error (as the SDK defines it; session tracking must be on), and issues by the number of affected users. Both count only what reached the tracker after filtering, sampling, blocking and quotas, so treat them as signals, not as complete health numbers ([SLIs](/observability/logs-metrics-traces/#sli-slo-sla-and-error-budgets)). Fix by impact, not by event count.

## Typical failures

- **No source maps**, or source maps from a different build: minified stack traces nobody can read.
- **Source maps served publicly** when you didn't intend to share your original source.
- **No release tagging**, so regressions can't be tied to deploys.
- **Noise from extensions and third parties** that hides real issues.
- **"Script error."** everywhere because third-party scripts are loaded without `crossorigin`.
- **Errors swallowed** by `try/catch` blocks or error boundaries that don't report.
- **Personal data in events**: emails in messages, tokens in URLs, full form contents in replays.
- **Alert on every event**, until the channel is muted.
- **Hitting the quota during an incident**, exactly when the data is most needed. Use the tracker's quotas, key rate limits and spike protection, watch for dropped events, and filter a known noisy error instead of letting it use up the quota for everything else.

## When to use

- **Any production frontend:** yes. Browser errors are invisible without it, and setup is usually one SDK and a source map upload step.
- **Backends:** yes, even with good logs: grouping, releases and alerts on new issues add a lot.
- **Mobile apps:** crash reporting is essential, since you can't see the devices at all.
- **Hosted or self-hosted:** hosted is the default; self-host only when data must not leave your infrastructure, and expect real operating work.

## Landscape

- **Error trackers:** Sentry, Bugsnag, Rollbar, Honeybadger, Raygun, TrackJS; error tracking inside broader platforms: Datadog, New Relic, Elastic, PostHog.
- **Self-hosted:** self-hosted Sentry; GlitchTip (accepts the Sentry SDKs).
- **Session replay:** Sentry Session Replay, LogRocket, PostHog, Datadog Session Replay.
- **Build integration:** source map upload plugins for Vite, webpack and Next.js; release and deploy reporting from CI.
