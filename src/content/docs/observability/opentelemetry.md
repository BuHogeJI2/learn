---
title: OpenTelemetry
description: The open standard for producing and shipping telemetry — API and SDK, automatic and manual instrumentation, context propagation, OTLP and the Collector — and what it deliberately doesn't do.
related:
  - observability/logs-metrics-traces
  - architecture/background-jobs
officialDocs:
  - title: OpenTelemetry — What is OpenTelemetry?
    url: https://opentelemetry.io/docs/what-is-opentelemetry/
  - title: OpenTelemetry — Instrumentation
    url: https://opentelemetry.io/docs/concepts/instrumentation/
  - title: OpenTelemetry — Context propagation
    url: https://opentelemetry.io/docs/concepts/context-propagation/
  - title: OpenTelemetry — Collector
    url: https://opentelemetry.io/docs/collector/
  - title: OpenTelemetry — Semantic conventions
    url: https://opentelemetry.io/docs/specs/semconv/
  - title: OpenTelemetry — JavaScript
    url: https://opentelemetry.io/docs/languages/js/
---

## What problem it solves

Before a common standard, every monitoring vendor shipped its own agent, its own SDK and its own data format. Instrumenting your code tied you to one vendor; services written in different languages produced data that didn't fit together; and a trace stopped at the boundary between two systems.

**OpenTelemetry** (OTel) is an open standard and a set of libraries, maintained under the Cloud Native Computing Foundation, for **producing, collecting and exporting** the three signals: traces, metrics and logs ([the signals](/observability/logs-metrics-traces/)). Instrument once, and send each signal to any compatible backend.

What it deliberately is **not**: a storage system or a user interface. You still need a backend to store, search and show the data.

## Mental model: instrument once, send anywhere

```
your code ──────────┐
                    ▼
instrumented ──► OTel API ──► OTel SDK ──── OTLP ───► Collector ───► backends
libraries                     sampling,                receive,        (Jaeger, Prometheus,
(http, db, fetch)             batching,                process,         Tempo, Loki, Datadog,
                              resource info            export           Honeycomb, …)
```

- **API**: the functions that code and libraries call: start a span, add an attribute, record a metric. Until an SDK is configured, the API records and exports nothing new (it can still pass along trace context it received), so libraries can instrument themselves safely at very low cost. Skip building expensive attribute values when nothing is recording.
- **SDK**: the implementation the application configures: sampling, batching, where to export.
- **Instrumentation**: the code that creates telemetry, either written by you or provided as packages that hook into common libraries.
- **OTLP** (OpenTelemetry Protocol): the standard format for sending telemetry, over [gRPC](/architecture/api-styles/#mental-model-three-ways-to-shape-a-contract) or HTTP.
- **Collector**: a separate service that receives telemetry, processes it and exports it to one or more backends.
- **Resource**: attributes that describe *where* data comes from: `service.name`, `service.version`, the deployment environment.
- **Semantic conventions**: standard names for attributes, such as `http.request.method` or `http.response.status_code`, so that [dashboards](/observability/dashboards-alerting/) and queries work the same across languages and vendors.
- **Context propagation**: passing the trace context between services in headers (W3C `traceparent`, plus `baggage` for extra key-value pairs), so one request stays one trace ([connecting the signals](/observability/logs-metrics-traces/#connecting-the-signals)).
- **Baggage** travels to every service you call, third parties included, and anyone can send it to you. Never put secrets or personal data in it, never trust it for authorization, and limit which values go where. It isn't copied into span attributes unless you do that explicitly.

## Instrumentation: automatic and manual

| | Automatic | Manual |
| --- | --- | --- |
| How | Packages or agents hook into known libraries: HTTP servers and clients, database drivers, queues | You create spans and attributes in your own code |
| Gives | Broad coverage with little code: every request, query and outgoing call | Business meaning: "apply-coupon", the cart size, the payment provider |
| Costs | More noise, some startup overhead; it doesn't know what matters to your business | Effort and code to maintain |

Most teams start automatic and add manual spans where questions come up.

One trap in Node.js: automatic instrumentation works by patching modules when they load. The SDK must start **before** the app imports `http`, Express or a database driver, usually from a separate file loaded first. Frameworks provide a hook for this, such as the `instrumentation` file in Next.js.

## Exporting: directly or through a Collector

- **Directly from the SDK to a backend.** Fewer moving parts. But every service holds vendor configuration and keys, and retries and buffering happen inside the app.
- **Through a Collector.** One place to batch, retry, remove sensitive data, add attributes, sample, and send to several backends. Switching vendors means changing the Collector's configuration, not redeploying every app.

The Collector usually runs in one or both of two roles:

- as an **agent** next to each app or on each machine, close to the source;
- as a **gateway**: a central pool that receives from the agents and does the heavy processing.

**Tail sampling** (deciding which traces to keep after seeing them) needs all spans of one trace to reach the same Collector instance, so a gateway in front of it balances by trace ID ([sampling](/observability/logs-metrics-traces/#typical-failures)). The Collector waits a fixed time for the spans of each trace, so very long or late spans can miss the decision, and it can't keep spans that the SDK already dropped with head sampling.

## Maturity: check per signal and per language

- **Traces and metrics** are stable in the main languages, including JavaScript.
- **Logs** have a stable data model, but SDK maturity varies (in JavaScript it is still in development). A common approach is to keep your existing logger and connect it to OpenTelemetry through a log bridge, which sends its records through the OpenTelemetry pipeline. With correlation enabled, lines written inside a span also carry its trace and span IDs; lines outside any span (startup, scheduled work) have none.
- **Profiles** (samples of which functions use CPU and memory) are a newer signal, still in alpha.
- **Browser instrumentation** (page loads, `fetch` calls, user interactions) exists but is officially experimental.

For the frontend, many teams use an [error-tracking](/observability/error-tracking/) or [real-user monitoring](/observability/web-vitals/#lab-data-and-field-data) tool in the browser and connect it to backend traces by sending `traceparent` with API calls. On another origin, the API must allow that header in [CORS](/security/browser-boundaries/#cors-the-server-opts-in-to-being-read). Exporting telemetry directly from the browser means a public endpoint that anyone can send data to; put it behind a proxy or Collector with limits.

## Typical failures

- **The SDK starts too late**, after the modules it should patch were loaded: no spans, and no error either.
- **No `service.name`**, so everything appears as `unknown_service`.
- **Context lost** across a queue, a thread pool or an untracked async boundary, so one request becomes several broken traces ([background jobs](/architecture/background-jobs/)).
- **Sensitive data in attributes**: SQL statements with values, headers with tokens, emails. Remove it in the SDK or the Collector. Data already sent to other services in request headers, such as baggage, can't be removed later.
- **High-cardinality attributes on metrics** (attributes with very many unique values, such as user IDs), which multiply storage cost.
- **Keeping every trace** at high traffic, or sampling only at the start and losing the rare errors.
- **An unwatched Collector.** Under overload it can run out of memory; configure its memory limiter, queue and retry limits with headroom. Queues and retries are finite, and an in-memory queue is lost when the Collector restarts (a persistent queue on disk survives that, within its own limits). Watch the Collector's own metrics: refused data, queue size, failed exports.
- **Semantic convention changes after upgrades.** Attribute names have changed between versions (for example, `http.method` became `http.request.method`), which can break dashboards and alerts.
- **Treating OpenTelemetry as a backend.** It produces and moves data; storage, queries and dashboards come from elsewhere.

## When to use it

- **New instrumentation:** default to OpenTelemetry, especially with several languages or when you want freedom to change vendors. Most commercial backends accept OTLP directly.
- **An existing vendor agent that works:** no need to rip it out; move gradually, starting with new services.
- **A small app on one platform:** the platform's built-in monitoring may be enough; OpenTelemetry pays off once requests cross several services.
- **The browser:** pair a real-user monitoring or error-tracking tool with `traceparent` propagation; use the OpenTelemetry browser SDK if its experimental status is acceptable to you.

## Landscape

- **The project:** language SDKs (JavaScript, Java, Python, Go, .NET and more), instrumentation packages and agents, the Collector (core and "contrib" builds with more components), OTLP, semantic conventions, the OpenTelemetry Operator for [Kubernetes](/delivery/kubernetes/).
- **Backends that accept OTLP**, each for the signals it stores: Jaeger and Grafana Tempo (traces), Prometheus and Grafana Mimir (metrics; Prometheus's OTLP receiver must be switched on), Grafana Loki (logs); Elastic, SigNoz, Honeycomb, Datadog, New Relic and Dynatrace for several signals.
- **Vendor distributions of the SDK and Collector:** AWS Distro for OpenTelemetry, Grafana Alloy, Elastic's EDOT, Splunk's distribution.
- **Frameworks:** the Next.js `instrumentation` hook and `@vercel/otel`.
- **Without code changes:** eBPF-based instrumentation (Grafana Beyla), which observes network and system calls from inside the Linux kernel.
