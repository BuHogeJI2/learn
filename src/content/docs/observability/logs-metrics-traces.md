---
title: Logs, metrics and traces
description: The three signals of observability, which question each one answers, how to connect them, and how SLIs, SLOs and alerts turn them into decisions.
related:
  - delivery/deployment-models
  - architecture/application-boundaries
  - web-platform/page-loading
  - architecture/reliability
  - architecture/scaling
officialDocs:
  - title: OpenTelemetry — Observability primer
    url: https://opentelemetry.io/docs/concepts/observability-primer/
  - title: OpenTelemetry — Signals
    url: https://opentelemetry.io/docs/concepts/signals/
  - title: W3C — Trace Context
    url: https://www.w3.org/TR/trace-context/
  - title: Google SRE book — Monitoring distributed systems
    url: https://sre.google/sre-book/monitoring-distributed-systems/
  - title: Google SRE book — Service level objectives
    url: https://sre.google/sre-book/service-level-objectives/
  - title: Google SRE workbook — Alerting on SLOs
    url: https://sre.google/workbook/alerting-on-slos/
---

## What problem it solves

Production breaks in ways nobody predicted, and you can't attach a debugger to it. When something goes wrong, you need answers fast:

- Is it broken? For whom?
- Since when? After which [deploy](/delivery/deployment-models/#releasing-from-commit-to-users)?
- Where: which page, which service, which region?
- Why?

**Monitoring** watches indicators you chose in advance. **Observability** is the wider ability to answer *new* questions about a running system from the data it emits. Both are built from the same signals.

For a frontend developer, the hard part is that most problems happen where you can't see them: JavaScript errors in users' browsers, slow pages on cheap phones, and one click that travels through the browser, a [CDN](/web-platform/cdn/) (servers near users), a [BFF](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends) (a server layer for one frontend) and several services.

## Mental model: three signals, three questions

| Signal | What it is | Answers | Trade-offs |
| --- | --- | --- | --- |
| **Metrics** | Numbers aggregated over time, with a few labels: requests per second, error rate, latency percentiles, CPU | "Is something wrong? How much? Since when?" | Cheap to store and query; chosen in advance; no detail about single requests |
| **Logs** | Timestamped records of events, ideally **structured** (fields such as JSON instead of free text) | "What exactly happened in this case?" | Rich detail; expensive at high volume; hard to aggregate when unstructured |
| **Traces** | The path of one request through the system, as a tree of timed **spans** (one span per operation) | "Where did the time go? Which part failed?" | Essential with several services; usually **sampled** (only a share of requests is kept) |

Specialized signals build on these:

- **[Error tracking](/observability/error-tracking/)**: exceptions grouped by cause, with stack traces, the release and the affected users.
- **RUM** (real-user monitoring): performance and errors measured in real users' browsers.
- **Profiles**: which functions use CPU and memory.

A trace makes the "where" visible:

```
trace 4bf92f…  GET /checkout                     820 ms
├─ BFF: render page                              790 ms
│  ├─ orders-service:  GET /cart                  40 ms
│  ├─ pricing-service: POST /quote               650 ms   ← the slow part
│  │  └─ db: SELECT … FROM prices                610 ms
│  └─ users-service:   GET /me                    30 ms
```

The usual investigation moves from wide to narrow: an **alert** on a metric → a **[dashboard](/observability/dashboards-alerting/)** narrows it down (which endpoint, region, release) → a **trace** of a slow or failed request → the **logs** of the guilty span.

## Connecting the signals

Signals are only useful together, so they must share identifiers:

- **Trace context.** The first component that sees a request creates a **trace ID**. Every operation records a **span** with its own span ID and a pointer to its **parent** span. When a service calls another one, it sends the trace ID and the current span ID in a header (the W3C `traceparent` header), so the callee's spans join the same tree under the right parent.
- **Trace and span IDs in every log line written during a request.** Then you can jump from a trace to its logs, and from an error to its trace. Logs outside a request (startup, scheduled work) carry the service, the release and a job identifier instead.
- **Common attributes** on every signal: service name, version or release, environment, region. They let you ask "did errors start with release 1.42?"
- **From the browser.** Frontend SDKs can start the trace and send `traceparent` with API calls, so a slow click connects to the backend spans. On a different origin, the API must allow that header in [CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read).

One cost trap: **cardinality**, the number of unique time series. Every unique combination of a metric name and all its label values is a separate series, so the values multiply across labels: 50 endpoints × 10 status codes × 20 regions is already 10,000 series. A label with unbounded values (user ID, request ID, a URL with IDs inside) makes the count explode. Keep such values in logs and traces, not in metric labels.

## What to measure

For services that handle requests, the classic sets are:

- **RED**: **R**ate (requests per second), **E**rrors (failed requests), **D**uration (latency).
- **Google's four golden signals**: latency, traffic, errors and **saturation** (how full a resource is: CPU, memory, the database connection pool, a queue's length).

Measure latency with **percentiles**, not averages:

- **p50** (the median) is the typical request; **p95** and **p99** show the slow tail. "p99 = 1.2 s" means 1% of requests are slower than 1.2 seconds.
- Averages hide the tail, and the tail matters: one page view can make dozens of requests, so many users meet the slow 1%.
- Percentiles can't be averaged across servers. Systems store **histograms** (counts per latency range) and compute percentiles from them.
- Measure errors separately: a fast failing request can make latency look better.

For the frontend, add [Core Web Vitals](/observability/web-vitals/) from real users ([metrics](/web-platform/page-loading/#how-the-steps-map-to-metrics)), the JavaScript error rate, and API failures as the client sees them. A server that returns `200 OK` doesn't mean the page worked.

## SLI, SLO, SLA and error budgets

These turn measurements into decisions:

- **SLI** (service level indicator): a measured share of good events, such as "the share of checkout requests that succeed in under 300 ms". Measure it as close to the user as you can: at the [load balancer](/architecture/scaling/#load-balancing), the CDN or in the client. Compute it from complete counters or histograms of all requests, not from sampled traces: a sample that keeps every error but only some successes makes the error rate look worse than it is.
- **SLO** (service level objective): the target for an SLI over a time window, such as "99.9% over 28 days". It is an internal goal.
- **SLA** (service level agreement): a contract with customers, with consequences (refunds, credits) if it is missed. It is usually looser than the SLO, so you notice problems before you owe money.
- **Error budget**: 100% minus the SLO. The amount of failure you are allowed. While budget remains, ship freely; when it is spent, slow down risky releases and fix reliability. It turns "speed or stability?" into a number.

For intuition, here is what a **time-based** availability target allows over a 30-day month, if the service fails completely during the outage. A request-based SLO counts bad requests instead: an outage at peak traffic uses more budget than one at night, and slow requests use budget too.

| SLO | Allowed full downtime |
| --- | --- |
| 99% | about 7 hours 12 minutes |
| 99.9% | about 43 minutes |
| 99.99% | about 4 minutes |

100% is the wrong target. Users' networks and devices fail more often than that anyway, and each extra nine costs far more than the previous one.

## Alerts that people act on

- **Alert on symptoms users feel** (error rate, latency against the SLO), not on every possible cause ("CPU at 80%"). Causes belong on dashboards, where you look during an investigation.
- **Burn-rate alerts.** Page someone when the error budget burns fast (for example, 2% of the monthly budget in one hour), and open a ticket when it burns slowly. Check a short window together with the long one, so the alert stops once the problem is over. In low-traffic services, one failed request can look like a huge burn; use synthetic checks (scripted requests sent on a schedule) or looser thresholds there.
- **Every page must be urgent, actionable and documented** with a runbook (the steps to diagnose and fix). If the right response to an alert is "ignore it", delete the alert.
- **Alert fatigue** is a real failure mode: too many noisy alerts, and the important one is ignored.

## Typical failures

- **Unstructured logs without request or trace IDs.** Nothing can be joined across services.
- **Secrets and personal data in logs**: tokens, passwords, emails, full request bodies. A leak and a compliance problem.
- **High-cardinality metric labels** and a monitoring bill that grows faster than traffic.
- **Only averages**, so the slow tail stays invisible.
- **Only server-side monitoring.** The server answers `200`, but the page fails in browsers because of a JavaScript error, a broken CDN file or a blocked third-party script.
- **Errors without release tags or source maps** (files that map minified code back to the original source), so a regression can't be linked to a deploy, and stack traces point into minified code.
- **Sampling that drops the rare failures.** **Head sampling** decides at the start of a request, before anyone knows how it ends, so it can drop the one failing trace. **Tail sampling** decides after the trace is complete and can keep all errors and slow requests, but it must buffer the spans first and has capacity limits of its own.
- **Traces that stop at a [queue](/architecture/background-jobs/) or a third-party call** because the trace context wasn't passed along.
- **Alerting on everything.**

## How to start

A reasonable minimum for a production app:

1. **Error tracking** in the frontend and the backend, with release tags and source maps.
2. **Structured logs** with a request or trace ID in every line written during a request.
3. **RED metrics** for each endpoint, saturation for databases and queues, and Web Vitals from real users.
4. **One or two SLOs** for the most important user journeys (sign-in, checkout), with alerts on them.
5. **Distributed tracing** as soon as a request crosses more than one service, including a BFF that calls APIs.

Instrument with **[OpenTelemetry](/observability/opentelemetry/)** where you can: one open standard for collecting all three signals, sent to any backend, so changing vendors doesn't mean changing code.

## Landscape

- **Standards:** OpenTelemetry (SDKs, the Collector, semantic conventions), W3C Trace Context.
- **All-in-one platforms:** Datadog, New Relic, Dynatrace, Honeycomb, Grafana Cloud, Elastic Observability, Sentry (errors, tracing, session replay).
- **Open-source building blocks:** Prometheus (metrics), Grafana (dashboards), Loki (logs), Tempo and Jaeger (traces), Pyroscope (profiles); ClickHouse-based stacks such as SigNoz and HyperDX.
- **Frontend and real users:** Sentry, Datadog RUM, LogRocket, Vercel Speed Insights, the `web-vitals` library.
- **On-call and incidents:** PagerDuty, incident.io, Rootly; status pages such as Atlassian Statuspage and Better Stack.
