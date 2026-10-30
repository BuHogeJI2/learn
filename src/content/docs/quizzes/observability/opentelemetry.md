---
title: OpenTelemetry — check yourself
description: Scenario questions about SDK setup, Collectors, context propagation, sensitive data and sampling.
quizFor: observability/opentelemetry
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. No spans, no errors

A team adds the OpenTelemetry Node.js SDK (the library that records and exports telemetry in the app) with automatic instrumentation (packages that create spans, timed operations, for common libraries) to an Express API written in CommonJS. They import and start the SDK at the top of `routes.ts`. The service starts, but no HTTP or database spans appear in the backend, and nothing is logged as an error. What is the likely cause?

<details>
<summary>Answer</summary>

Automatic instrumentation works by **patching modules when they load**. By the time `routes.ts` runs, `http`, Express and the database driver were already imported by the entry file, so they were never patched. Nothing fails; there is simply nothing to record.

Start the SDK **before** anything else is imported: in a separate file loaded first (for example with Node's `--require` or `--import` flag), or through the framework's hook, such as the `instrumentation` file in Next.js. An app written as ES modules may also need OpenTelemetry's loader hook; follow the current SDK setup guide. Also set `service.name`, or everything shows up as `unknown_service`.

</details>

## 2. Trying a second vendor

Twelve services in four languages send traces and metrics straight from their SDKs to a commercial backend, each with the vendor's API key in its configuration. The company wants to try another backend for a month, in parallel. How painful is that, and how would you set it up?

<details>
<summary>Answer</summary>

With direct export, every service holds vendor configuration, so trying a second backend means changing and redeploying all twelve. The instrumentation itself doesn't change, because it uses the vendor-neutral OpenTelemetry API: that is the point of the standard.

Put a **Collector** (a separate service that receives, processes and exports telemetry) in between: the services send OTLP (the OpenTelemetry protocol) to it, and it exports to both backends at once. Vendor keys, batching, retries, removing sensitive data and sampling then live in one place. The cost is one more component to run and monitor (its memory limits, queues and failed exports), but switching or adding backends becomes a configuration change.

</details>

## 3. Traces that stop at the queue

A checkout request creates an order and puts a job on a [queue](/architecture/background-jobs/); a worker sends the confirmation email. In the tracing backend, the request and the worker appear as two unrelated traces, so a slow email can't be connected to the checkout. Why?

<details>
<summary>Answer</summary>

**Context propagation** (passing the trace context between services, see [connecting the signals](/observability/logs-metrics-traces/#connecting-the-signals)) usually happens automatically for HTTP calls made through supported, instrumented clients (the `traceparent` header), but a queue is a boundary the instrumentation may not cover. Most likely the trace context wasn't put into the message, so the worker started a new trace.

Inject the context into the **message headers or attributes** when publishing, and extract it in the worker (many queue instrumentations do this; otherwise use the propagation API). For a job that runs much later, the worker's span is often linked to the original trace rather than made a child of it, but either way you can follow the checkout to the email.

</details>

## 4. Personal data in telemetry

A security review finds full SQL statements with customer emails in span attributes, `Authorization` headers recorded on HTTP spans, and a `user.email` entry in **baggage** (key-value pairs that travel with the request to every service it calls). What do you fix, and where?

<details>
<summary>Answer</summary>

- **Attributes**: stop recording sensitive values in the SDK configuration (no request headers with tokens, SQL without parameter values), and add a processor in the **Collector** that removes or masks them as a second line, before the data reaches any backend.
- **Baggage** is worse: it is sent in request headers to every service you call, **third parties included**, and anyone can send baggage to you. It can't be cleaned up later in the Collector, because it has already left. Remove personal data from baggage entirely, limit which entries are sent to which destinations, and never trust incoming baggage for decisions such as authorization.

Telemetry is data like any other: it needs the same privacy rules as the database.

</details>

## 5. Tail sampling keeps broken traces

To keep all errors and slow requests but only 5% of the rest, the team sets up **tail sampling** (deciding which traces to keep after collecting their spans) on three Collector instances behind a round-robin [load balancer](/architecture/scaling/#load-balancing). Many kept traces are missing spans, and some error traces aren't kept at all. Why?

<details>
<summary>Answer</summary>

Tail sampling needs **all spans of one trace on the same Collector instance**, because the decision depends on the whole trace. Round-robin balancing spreads one trace's spans across three instances; each sees only a part, and decides on incomplete information.

Put a load-balancing layer in front that routes by **trace ID** (the Collector has an exporter for this), so every span of a trace reaches the same instance. Also remember the limits: the Collector waits only a fixed time for spans, so very long traces can miss the decision, and it can't keep spans that SDKs already dropped with head sampling (deciding at the start of a request).

</details>
