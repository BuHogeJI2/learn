---
title: Reliability patterns
description: How to keep a system working when its parts fail — timeouts and deadlines, retries with backoff and jitter, idempotency, rate limiting, load shedding, circuit breakers and fallbacks, as one request lifecycle.
related:
  - architecture/scaling
  - architecture/application-boundaries
  - architecture/api-styles
  - data/consistency
  - observability/logs-metrics-traces
  - architecture/background-jobs
officialDocs:
  - title: AWS Builders' Library — Timeouts, retries and backoff with jitter
    url: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
  - title: AWS Builders' Library — Making retries safe with idempotent APIs
    url: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-apis/
  - title: Google SRE book — Handling overload
    url: https://sre.google/sre-book/handling-overload/
  - title: Google SRE book — Addressing cascading failures
    url: https://sre.google/sre-book/addressing-cascading-failures/
  - title: Martin Fowler — Circuit Breaker
    url: https://martinfowler.com/bliki/CircuitBreaker.html
  - title: MDN — Retry-After header
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After
---

## What problem it solves

In any system that talks over a network, something is always failing: a lost packet, a slow database, an instance restarting during a [deploy](/delivery/deployment-models/#releasing-from-commit-to-users), a third-party API that is down. This is **partial failure**: some parts work, some don't, and the caller often can't tell whether the other side failed before or after doing the work.

Without deliberate patterns, failures spread:

- one slow dependency makes every caller wait, until all their threads and connections are stuck and they fail too (a **cascading failure**);
- well-meant retries multiply the load on a system that is already struggling and turn a short problem into an outage.

The frontend is a client too: a `fetch` without a timeout, a spinner that never ends, a "retry" button that creates a second order.

## Mental model: one call, three outcomes

```
Client ──► Service A ──► Service B ──► Database
             timeout?      retry?        overloaded?

Every call ends in one of three ways:
  success  ·  a clear failure  ·  unknown (a timeout: did it run or not?)
```

The **unknown** outcome is the key. A timeout means "no answer in time", not "it didn't happen". The order may have been created, and only the response was lost.

The patterns on this page follow the life of one call:

1. **Before sending:** is the target known to be failing? (circuit breaker) Is this client sending too much? (rate limiting)
2. **While waiting:** how long is it worth waiting? (timeouts and deadlines)
3. **After a failure:** try again, when and how many times? (retries with backoff and jitter) Is it safe to repeat? (idempotency)
4. **On the receiving side:** is there more work than capacity? (load shedding, backpressure)
5. **If it still fails:** what does the user get? (fallbacks)

## Timeouts and deadlines

- **Every network call needs a timeout.** Many HTTP clients wait for minutes or forever by default; the browser's `fetch` has no timeout of its own (use `AbortSignal.timeout()`). Without a timeout, a dead dependency holds your connections and threads until you run out.
- **Choose the value from measurements**, not a round number like 30 seconds. Decide how many healthy but slow requests you can afford to cut off, and pick the matching latency percentile ([percentiles](/observability/logs-metrics-traces/#what-to-measure)): a timeout at the p99 cuts off about 1% of normal requests. Check what the timeout covers: only waiting for the response, or also DNS, connection and TLS setup.
- **Pass a deadline down the chain.** A user request has a total budget, for example 2 seconds. Each call further down gets *the time that is left*, not a fresh 2 seconds. Otherwise inner services keep working on requests the user has already given up on. gRPC has deadlines built in, and many implementations can pass them on to the next call; with HTTP you pass them yourself. Either way, the code must notice when the deadline expires and actually stop its work.
- **Inner timeouts must be shorter than outer ones.** If the outer call gives up after 1 second while the inner one waits 5 seconds and retries, the inner work is wasted.

## Retries: bounded, spaced and safe

Retry only **transient** failures: network errors, timeouts, `503`, `429`. Don't retry errors that will repeat: `400`, `401`, `403`, `404`, `422` ([status codes](/web-platform/http/#status-codes-the-servers-verdict)).

The rules:

- **Limit the attempts** (two or three) and the total time (the deadline).
- **Exponential backoff**: wait longer before each attempt, such as 100 ms, 200 ms, 400 ms, up to a cap.
- **Jitter**: add randomness to each wait. Otherwise thousands of clients that failed at the same moment retry at the same moment too, and hit the recovering service together.
- **Respect `Retry-After`** when the server sends it.
- **Retry at one layer only.** If the browser, the [BFF](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends) (the frontend's own server layer), a service and the database driver each make three attempts (the original plus two retries), one failure can become 3 × 3 × 3 × 3 = 81 calls to the database.
- **Use a retry budget**: for example, retries may add at most 10% to the normal number of requests. Once the budget is used up, further retries are skipped, so a failing dependency gets bounded extra load instead of a pile-up. (Reacting to the dependency's health is the job of a circuit breaker, below.)
- **Repeat only what is safe to repeat**: see the next section.

## Idempotency: making "again" safe

An operation is **idempotent** when doing it twice has the same effect as doing it once. `GET`, `PUT` and `DELETE` are idempotent by definition ([methods](/web-platform/http/#methods-what-a-request-promises)); creating an order or charging a card is not.

The standard fix is an **idempotency key** ([API styles](/architecture/api-styles/#error-boundaries)):

1. The client creates **one key per intended operation** (for example when the checkout starts) and sends it with every attempt.
2. The server stores the key together with the result. When the work is local (rows in its own database), it does this in the same transaction as the work. An external effect, such as charging a card through a payment provider, can't join that transaction: pass the key on to the provider's own idempotency mechanism, record "pending" before the call and "done" after it, and reconcile anything left pending ([across services](/data/consistency/#across-services-no-shared-transaction)).
3. A repeat with the same key returns the stored result instead of doing the work again.

Details that matter: scope keys to the caller, and reject a reused key that comes with a different request body instead of replaying the old result; two attempts with the same key can arrive at the same time, so the second must wait or get a conflict response; keys are kept only for a limited time, so retries must stop before that window ends. Unique constraints in the database are a second line of defense ([consistency](/data/consistency/#concurrent-writes-and-isolation)).

## Protecting a service from overload

- **Rate limiting**: cap the requests per client (per user, API key or IP address) in a time window, and answer `429 Too Many Requests` with `Retry-After`. The common algorithm is a **token bucket**: each request spends a token; tokens refill at a steady rate, but only up to a fixed maximum (the bucket size), which limits how big a burst can be; when the bucket is empty, the request is rejected or waits. It protects fairness and stops abuse, such as password guessing.
- **Load shedding**: when a server is overloaded, it rejects part of the requests **quickly** (`503`) instead of accepting everything and timing out on all of them. Shed the least important work first: recommendations before checkout.
- **Concurrency limits and bulkheads**: limit how many requests an instance works on at once, and give each dependency its own pool of connections or workers. Like the compartments of a ship, one flooded part (one slow dependency) can't sink the rest.
- **Backpressure**: a slow consumer tells producers to slow down, for example through **bounded** queues that refuse new work when full. An unbounded queue doesn't remove overload; it turns it into growing latency and, finally, out-of-memory crashes.

## Circuit breakers and fallbacks

A **circuit breaker** wraps calls to one dependency and stops calling it while it is clearly failing:

```
          failure rate above the threshold
 CLOSED ───────────────────────────────────► OPEN
 (normal calls)                              (fail at once, no calls)
    ▲                                            │ after a pause
    │      trial calls succeed                   ▼
    └──────────────────────────────────────  HALF-OPEN
                trial call fails → back to OPEN   (a few trial calls)
```

Failing fast frees your own threads and connections and gives the dependency time to recover.

When a dependency fails, a **fallback** decides what the user gets:

- [cached](/architecture/caching/) or slightly stale data, marked as such;
- a default value;
- hiding a non-critical block (no recommendations, but checkout works).

This is **graceful degradation**: the product gets worse, not broken. Keep the critical path (sign-in, checkout) dependent on as few services as possible, and test fallbacks regularly: a fallback that never runs usually fails on the day it is needed.

In the frontend, the same ideas look like error boundaries (components that catch a failure in their part of the UI and show a fallback instead) around independent widgets, stale data with a "couldn't refresh" note, and [optimistic updates](/architecture/state/#writing) that roll back on failure.

## Typical failures

- **No timeouts.** Connections pile up waiting for a dead dependency, and the whole service goes down with it.
- **Retry storms**: retries at every layer, without backoff or jitter.
- **Retrying non-idempotent operations**: double charges, duplicate orders.
- **An inner timeout longer than the outer one.**
- **A health check that tests shared dependencies.** The database blips, every instance reports unhealthy, and the load balancer removes them all, or the orchestrator restarts them all. A **liveness** check (which usually triggers restarts) should only test that the process itself works. A **readiness** check (which decides routing) asks whether this instance can serve useful requests, mostly problems of *this* instance. If it also fails on a shared outage, every instance fails it at once; include a dependency only when the instance can serve nothing useful without it. Decide on purpose what the whole fleet does when a shared dependency is down, such as serving degraded pages.
- **Unbounded queues and pools** that hide overload until memory runs out.
- **Rate limits by IP address only.** Whole offices and mobile networks share one IP; limit by user or key where you can.
- **Treating a timeout as a definite failure.** The UI says "Order failed", the user orders again, and the first order did go through. Show "checking the status" and ask the server.
- **Fallbacks that were never tested.**
- **In the browser:** no timeout signal on `fetch` and no error state, so a spinner runs forever; a retry button that creates a new idempotency key on every click. Remember that aborting a request in the browser doesn't undo what the server already did.

## How to apply

For every call to another system:

1. A **timeout** based on measured latency, inside the overall **deadline**.
2. **Retries** only for transient errors: two or three, with exponential backoff and jitter, at one layer, respecting `Retry-After`.
3. **Idempotency** for every operation that changes state.
4. A **circuit breaker** where failing fast clearly helps: a dependency that can be slow or down for minutes. It adds state and failure modes of its own (a bad threshold can block healthy calls), and it should count only real dependency failures, not normal business rejections. For many calls, deadlines, concurrency limits and a retry budget are enough.
5. A **fallback** for every non-critical feature.

For every service: rate limits per client, concurrency limits and separate pools per dependency, load shedding, bounded queues.

Sometimes the most reliable answer is to stop waiting: accept the request, put the work in a [queue](/architecture/background-jobs/), and answer `202 Accepted` with a way to check the status later.

Verify all of this on purpose: **fault injection** (adding latency, killing instances, cutting a dependency) in staging, or carefully in production. Measure the result against your SLOs ([error budgets](/observability/logs-metrics-traces/#sli-slo-sla-and-error-budgets)).

## Landscape

- **Libraries:** resilience4j (Java), Polly (.NET), cockatiel and p-retry (Node.js), ky (fetch with timeouts and retries), TanStack Query (retries with backoff in the browser); gRPC has built-in deadlines and retry policies.
- **Infrastructure:** proxies and service meshes (Envoy, Istio, Linkerd) add timeouts, retries and circuit breaking outside your code; CDNs and API gateways enforce rate limits (Cloudflare, Kong, Amazon API Gateway); shared rate-limit counters in Redis (for example Upstash Ratelimit).
- **Durable execution** for long, multi-step operations that must finish despite crashes: Temporal, Restate, Inngest.
- **Fault injection and chaos engineering:** Chaos Monkey, Gremlin, AWS Fault Injection Service, Chaos Mesh, Toxiproxy.
