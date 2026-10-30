---
title: Scaling — check yourself
description: Scenario questions about bottlenecks, stateless servers, autoscaling and the data layer.
quizFor: architecture/scaling
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. More servers, worse results

During a campaign, the API got slow. The team increased the app instances from 5 to 50. Latency got worse and errors appeared. The database CPU is at 100%. What happened?

<details>
<summary>Answer</summary>

They scaled the **wrong tier**. The bottleneck was the database, and throughput is limited by the narrowest resource. Ten times more app servers sent more concurrent queries and opened ten times more connections to the same database, so it got even more overloaded.

Measure first, then fix the bottleneck: find the most expensive queries and add [indexes](/data/database-types/#mental-model-a-data-structure-on-disk-plus-guarantees), cache hot reads, put a connection pooler (a proxy that lets many clients share a few database connections) in front of the database, add read replicas (copies that serve reads) for read-heavy load, or give the database a bigger machine. Return the app tier to the size it needs.

</details>

## 2. Logged out at random

The app ran on one server. After adding a second instance behind a [load balancer](/architecture/scaling/#load-balancing) (which spreads requests across instances), users complain that they are randomly logged out and their carts sometimes empty. Why?

<details>
<summary>Answer</summary>

The app keeps **state in memory**: sessions and carts live in the process that created them. When the load balancer sends the next request to the other instance, that instance knows nothing about the user.

Make the servers **stateless**: keep [sessions](/security/auth/#sessions-in-practice-the-lifecycle) in a database, in Redis or in signed cookies (the data lives in the cookie, protected from changes by a server signature), and carts in the database. Then any instance can handle any request, and an instance can die or be replaced without losing anything. Sticky sessions (always sending a user to the same instance) hide the problem, but make load uneven and still lose state when that instance dies.

</details>

## 3. A known spike

Marketing announces a flash sale at 10:00 next Friday, and expects ten times the usual traffic within a few minutes. The app uses CPU-based autoscaling. Is that enough?

<details>
<summary>Answer</summary>

Probably not. Autoscaling reacts in **seconds to minutes**: CPU must rise, the metric must be collected, new instances must start and pass their readiness checks (the check that says an instance can take traffic). A spike in the first minute arrives before the new capacity.

For a known event: **scale up in advance** (raise the minimum before 10:00), check that the next tier can take it (database connections, external API quotas), **load-test** the expected peak beforehand, and decide what to shed if it still overflows (for example, turn off recommendations). Keep a maximum on autoscaling so it doesn't overload the database or the bill.

</details>

## 4. One product, all the writes

During a flash sale, one product gets thousands of purchases per second. Every purchase decrements the same stock row, and the database spends its time waiting for locks on that row. Adding read replicas didn't help. Why, and what are the options?

<details>
<summary>Answer</summary>

It is a **hot spot on writes**. Replicas help reads; every write to that row still goes to the one place that owns the record, and each update waits for the previous one's lock.

Options:

- **Split the stock**: keep it in, say, ten rows (buckets) and take from a random one; the total is their sum. More writes can go in parallel. Each take must still be an atomic "decrement only if above zero", and when a bucket runs out, the purchase tries another one, which adds logic.
- **Queue the purchases** in a durable, bounded [queue](/architecture/background-jobs/) and answer "you're in line" at once. This smooths the burst and removes lock contention, but it doesn't make the stock row faster: if purchases arrive faster than they are processed, the queue and the wait grow, so it needs a limit and a plan for the processing rate. A place in the queue is not yet a purchase.
- **Reserve in a fast store** (for example Redis with an atomic check-and-decrement) and write orders to the database afterwards. Fast, but now there are two sources of truth: give each reservation a unique ID so retries don't reserve twice, make reservations expire if the order isn't completed, and reconcile the store with the database after failures ([consistency](/data/consistency/)).

Stock is a rule that must never break (no overselling), not an approximate counter, so every option keeps an atomic check somewhere. All of them trade simplicity for throughput; choose the simplest one that meets the expected peak.

</details>

## 5. Going global

Users in Asia and Europe complain that the app is slow; servers and the database are in the US. An engineer proposes running the database with writes in all three regions. What would you do first?

<details>
<summary>Answer</summary>

Go in order of cost:

1. Put static files and cacheable pages on a **[CDN](/web-platform/cdn/)** (servers near users that keep copies). It brings most of the latency benefit with little complexity.
2. Run app servers in several regions, with **read replicas** close to them; writes still go to the one primary region.
3. Partition data by region if users mostly touch their own region's data (it also helps with data-residency laws).

**Writes in every region** come last: either each write waits for regions to agree (slow writes), or regions accept writes independently and conflicts are resolved later (complex logic). Measure which requests are slow first; most apps never need step 4.

</details>

## 6. How many connections?

An API handles 300 requests per second at peak. Each request holds a database connection for about 40 ms. It runs on 30 instances, each with a connection pool of 20. The database allows 200 connections. Is the pool size right?

<details>
<summary>Answer</summary>

Use **Little's law** for the resource itself: connections in use ≈ 300 requests/s × 0.04 s = **about 12** on average. That is a starting estimate, not a pool size: bursts, slow queries that hold connections longer, and uneven load across instances need headroom on top. Size the total from measurements and a load test, and keep it below the database limit.

But 30 instances × 20 = **600 connections** could be opened, three times what the database allows. Under a spike, instances fail to connect even though the database needs only a fraction of that. Use smaller pools per instance, or a shared connection pooler (PgBouncer, RDS Proxy) between the app and the database. The general lesson: when you scale one tier, check the limits of the next one.

</details>
