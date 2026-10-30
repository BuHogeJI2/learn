---
title: Logs, metrics and traces — check yourself
description: Scenario questions about choosing signals, percentiles, cardinality, SLOs and alerts.
quizFor: observability/logs-metrics-traces
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. "The average is fine"

Support gets complaints that checkout is slow. The [dashboard](/observability/dashboards-alerting/) shows an average API latency of 200 ms, which looks healthy. Is the dashboard wrong?

<details>
<summary>Answer</summary>

Not wrong, but it hides the problem. An **average** is pulled down by the many fast requests and hides the slow tail. Look at **percentiles**: p50 (the typical request), p95 and p99 (95% or 99% of requests are at or below this latency; the slowest 5% or 1% are above it). A p99 of 4 seconds can sit behind a 200 ms average, and since one page view makes many requests, many users meet that slow 1%.

Then narrow it down: split the latency by endpoint, region and release, and open a few **traces** (the timed path of one request through the services) of slow checkout requests to see which part takes the time.

</details>

## 2. The monitoring bill tripled

To debug a customer issue, a developer added a `user_id` label (a key-value tag on a metric, used to split it) to the request-latency metric. A month later the monitoring bill has tripled, and dashboards load slowly. Why?

<details>
<summary>Answer</summary>

**Cardinality**: every unique combination of label values is a separate time series. With `user_id` as a label, the number of series grows with the number of users, multiplied by every other label (endpoint, status, region). Metric systems store and index each series, so cost and query time explode.

Keep unbounded values (user ID, request ID, URLs with IDs) out of metric labels. Put them in **logs and traces**, which are made for per-request detail, and use metrics for aggregates (per endpoint, per status). Remove the label and drop the series it created.

</details>

## 3. Green dashboards, broken checkout

Users report that the "Pay" button does nothing. All server dashboards are green: error rate near zero, every API request returns `200`. How can both be true, and what was missing?

<details>
<summary>Answer</summary>

The failure happens **in the browser**, where server monitoring can't see it: a JavaScript error after a deploy, a script blocked by an ad blocker or [CSP](/security/web-attacks/#csp-limiting-what-can-run) (a header that limits which scripts may run), a [CDN](/web-platform/cdn/) file that failed to load. If the button handler crashes, no request is sent at all, so the server sees nothing wrong.

Add frontend signals: **[error tracking](/observability/error-tracking/)** in the browser (with release tags and source maps, files that map minified code back to the source), RUM (real-user monitoring: performance and errors measured in users' browsers, see [Web Vitals](/observability/web-vitals/#lab-data-and-field-data)), and API failures as the client sees them. A server `200` doesn't mean the page worked.

</details>

## 4. An error you can't connect to anything

The pricing service logs `quote failed: timeout` a few hundred times an hour. Nobody can tell which user actions cause it, or whether users even notice. The logs are plain text lines. What would make this answerable?

<details>
<summary>Answer</summary>

The signals don't share identifiers. Make them connect:

- **Trace context** ([propagation](/observability/opentelemetry/#mental-model-instrument-once-send-anywhere)): the first component (ideally the browser) starts a trace and sends the trace ID together with the current span ID in the `traceparent` header to every service it calls, so all their spans (timed operations) join one tree under the right parents.
- **Structured logs** (fields instead of free text) with the **trace ID and span ID** in every line written during a request. Then from the error log you can open the whole trace: which page, which click, which other services were involved.
- **Common attributes** on every signal: service, release, environment, region.

IDs connect signals, but they don't record what the user experienced: a backend retry or a fallback can hide the timeout completely. So also record the **outcome** of the user journey in the browser (succeeded, failed, used a fallback) as an event or span attribute on the same trace. Then the question "do users notice?" becomes a query: how many of these traces ended in a failed or degraded outcome.

</details>

## 5. Alerts nobody reads

The on-call engineer gets about 40 alerts a week: "CPU above 80%", "memory above 75%", "disk above 70%". Most resolve on their own, so people have started to ignore them. Last week a real outage was noticed by customers first. What would you change?

<details>
<summary>Answer</summary>

This is **alert fatigue**: alerts on **causes** that often don't hurt anyone, so the important one is lost in the noise.

Alert on **symptoms users feel**: error rate and latency of key user journeys, measured against an **SLO** (a target such as "99.9% of checkout requests succeed in under 300 ms over 28 days"). Use **burn-rate** alerts (burn rate: how fast the error budget is being used): page someone when the error budget (the allowed failures under the SLO) burns fast, open a ticket when it burns slowly. Move CPU, memory and disk thresholds to dashboards for investigations; keep alerts only for causes that predict real damage and need action, such as "the database disk will be full in four hours". Every alert that pages must be urgent, actionable and have a runbook (the steps to diagnose and fix); delete the ones whose correct response is "ignore".

</details>

## 6. "Checkout must be 100% available"

When the team discusses an SLO for checkout, a manager insists on 100%. What do you answer?

<details>
<summary>Answer</summary>

100% is the wrong target. Users' own networks and devices fail more often than that, so they can't see the difference above a certain level, and each extra nine costs far more than the previous one (redundancy, slower releases, more people on call). A 100% target also leaves **no error budget**, so every release becomes a risk nobody may take.

Choose a target that matches what users notice and the business can pay for, for example 99.9% or 99.95% of checkout requests succeeding over 28 days, measured close to the user. The remaining budget is what lets the team ship: while it lasts, release freely; when it is spent, slow down and fix reliability.

</details>
