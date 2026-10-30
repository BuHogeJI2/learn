---
title: Reliability patterns — check yourself
description: Scenario questions about timeouts, retries, idempotency, overload and fallbacks.
quizFor: architecture/reliability
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A 30-second blip, a 30-minute outage

The database restarted and was unavailable for 30 seconds. The site stayed down for 30 minutes. After the database came back, it received about 20 times its normal load and kept falling over. What happened, and what would prevent it?

<details>
<summary>Answer</summary>

A **retry storm**. Every layer retried at once and several times: the browser, the [BFF](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends) (the frontend's own server layer), the service and the database driver. Three attempts at each of four layers can turn one failed request into 81 database calls. All clients failed at the same moment and retried at the same moment, so the recovering database was hit by a wall of traffic.

Prevention:

- Retry at **one layer** only, two or three attempts, with **exponential backoff** (longer waits each time) and **jitter** (random spread, so clients don't retry together).
- A **retry budget**: retries may add at most, say, 10% to normal traffic; once the budget is used up, further retries are skipped, so the extra load stays bounded.
- A **circuit breaker** (stop calling a dependency while it is clearly failing) is what reacts to its health: it stops the calls and gives it time to recover.

</details>

## 2. Recommendations took the whole site down

The product page calls a recommendations service. One day that service starts answering in 30 seconds instead of 100 ms. Soon every page of the site hangs, including checkout, which doesn't use recommendations. Why, and what was missing?

<details>
<summary>Answer</summary>

A **cascading failure**. The calls had no (or a very long) **timeout**, so every product page request waited, holding a connection and a worker. The server ran out of workers, and then nothing could be served, checkout included.

What was missing:

- A **timeout** based on measured latency (for example a little above the normal p99, the latency that 99% of requests beat), inside the request's overall **deadline** (the total time budget of the user's request, shared by every call below it).
- A **fallback**: render the page without recommendations.
- A **bulkhead**: a separate, limited pool for calls to this dependency, so one slow service can't use up the workers that other pages need.
- Optionally a **circuit breaker**, so after many failures the page stops waiting at all for a while.

</details>

## 3. "Payment failed" — but it didn't

The payment request from the browser times out after 15 seconds. The UI shows "Payment failed, please try again". The user clicks again and is charged twice. What went wrong?

<details>
<summary>Answer</summary>

A timeout is an **unknown outcome**, not a failure: the payment may have gone through, and only the response was lost. The UI treated it as a definite failure, and the second click created a new payment.

Fixes:

- Use an **[idempotency key](/architecture/reliability/#idempotency-making-again-safe)** (a unique ID that lets the server recognize a repeat of the same operation): one key per intended payment, created when the checkout starts and reused for every attempt and click. The server returns the stored result for a repeated key instead of charging again.
- After a timeout, show "Checking the payment status…" and ask the server, instead of "failed".
- Remember that aborting a request in the browser doesn't undo what the server already did.

</details>

## 4. One database blip, every instance removed

Each app instance has a health check endpoint that runs `SELECT 1` against the shared database. During a short database hiccup, the [load balancer](/architecture/scaling/#load-balancing) marked every instance unhealthy and the orchestrator (the platform that runs and restarts the instances, such as [Kubernetes](/delivery/kubernetes/)) restarted all of them. The restart took several minutes. What is wrong with this health check?

<details>
<summary>Answer</summary>

It tests a **shared dependency**. When the dependency blips, every instance fails at the same time, so the platform removes or restarts the whole fleet, which turns a short hiccup into a long outage.

Separate the checks:

- **Liveness** (used to restart): only "is this process itself working?" (not stuck, not out of memory).
- **Readiness** (used for routing): can this instance serve useful requests now? Mostly problems of *this* instance, such as still starting up. A dependency failure belongs here only if, without it, the instance can serve nothing useful, and then remember that the whole fleet fails readiness together.

Decide on purpose what the fleet does when a shared dependency is down: usually keep serving cached or degraded pages and return a fast `503` for features that need the database, rather than withdrawing every instance from traffic, and let it recover without restarts.

</details>

## 5. The rate limit that blocked an office

To stop password guessing, the login endpoint allows 10 attempts per minute per IP address. A customer with 2,000 employees behind one office IP reports that nobody can log in on Monday morning. What would you change?

<details>
<summary>Answer</summary>

Whole offices and mobile networks share **one IP address**, so a per-IP limit treats thousands of people as one client. Meanwhile, an attacker with many IPs is barely slowed down.

Limit by what identifies the target and the actor: attempts **per account** (protects each user from guessing), per API key or session where there is one, and keep a much higher, coarse per-IP limit only against floods. Add other defenses for login: CAPTCHA or step-up (asking for an extra proof) after several failures, checks against leaked passwords, and MFA (a second factor, such as an authenticator app; see [authentication](/security/auth/#how-users-prove-who-they-are)). The trade-off: per-account limits let an attacker lock a specific user out, so prefer slowing down (growing delays) over hard lockouts.

</details>
