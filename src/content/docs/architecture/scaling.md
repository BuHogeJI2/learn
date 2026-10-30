---
title: Scaling
description: How a system handles more load — finding the bottleneck, doing less work, scaling up or out, load balancing, stateless servers, and growing the data layer with caches, replicas and shards.
related:
  - architecture/caching
  - data/database-types
  - data/consistency
  - delivery/deployment-models
  - observability/logs-metrics-traces
  - architecture/reliability
officialDocs:
  - title: The Twelve-Factor App — Processes
    url: https://12factor.net/processes
  - title: NGINX — Using nginx as HTTP load balancer
    url: https://nginx.org/en/docs/http/load_balancing.html
  - title: Kubernetes — Horizontal Pod Autoscaling
    url: https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/
  - title: AWS Well-Architected — Performance efficiency pillar
    url: https://docs.aws.amazon.com/wellarchitected/latest/performance-efficiency-pillar/welcome.html
  - title: The System Design Primer
    url: https://github.com/donnemartin/system-design-primer
---

## What problem it solves

Load grows: more users, more data, more requests per user. Launches and sales can bring ten times the usual traffic in minutes. At some point responses get slower and errors appear.

**Scaling** means keeping latency and errors within your targets as load grows, at a reasonable cost, and scaling back down when load drops so you don't pay for idle machines.

Two words that are often mixed up:

- **Performance**: how fast the system is for **one** user.
- **Scalability**: whether it **stays** that fast for many users.

A page can be fast in testing and collapse under real traffic, or be slow for everyone even with no load.

## Mental model: find the bottleneck

A request passes through a chain of resources: CPU, memory, network, disk, database connections, locks, the quota of an external API. **Throughput is limited by the narrowest one.** Adding capacity anywhere else changes nothing.

Resources don't slow down gradually. As a resource gets close to fully used, requests start waiting in queues, and the waiting time grows sharply:

```
latency
   │                                      │
   │                                     ╱
   │                                   ╱
   │                               _ ─
   │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
   └────────────────────────────────────── utilization
   0%                        ~70%      100%
```

That is why systems need **headroom**: a server that runs at 90% on a normal day has nothing left for a spike.

A useful formula, **Little's law**: on average, requests in progress = arrival rate × average time each request takes. At a steady 200 requests per second and 0.5 seconds per request, about 100 requests are in progress on average. Apply it to each resource separately, using the time *that resource* is held: if a request uses a database connection for only 50 ms of its 0.5 seconds, 200 requests per second need about 10 connections, not 100. And an async server (such as Node.js) can hold many requests with very few threads.

**Measure before you scale.** Saturation metrics show where the bottleneck is ([what to measure](/observability/logs-metrics-traces/#what-to-measure)), and load tests show where it will be. In typical web apps the database is the first to hit its limit, then application CPU, then external APIs.

## Scaling strategies

### Do less work

Often the cheapest and most effective step:

- [Caching](/architecture/caching/) and a [CDN](/web-platform/cdn/) (servers near users that keep copies) for anything that can be shared;
- doing work once at build time instead of on every request ([rendering strategies](/architecture/rendering/));
- better queries and [indexes](/data/database-types/#mental-model-a-data-structure-on-disk-plus-guarantees);
- moving slow work out of the request into [background jobs](/architecture/background-jobs/). Strictly, this moves work rather than removing it: requests get fast and bursts are smoothed, but the workers still need enough capacity, or the backlog keeps growing;
- pagination and limits, so no request can ask for "everything".

### Vertical: a bigger machine

More CPU and memory for the same server (scaling **up**). It needs few architectural changes and goes further than most people expect. But more cores help only if the software can use them: one Node.js process runs JavaScript on one core, so you need several processes or workers. Scale the resource that is actually saturated. The limits: there is a biggest machine, prices grow fast near the top, it is still one machine that can fail, and resizing may need a restart.

### Horizontal: more machines

Several copies of the app behind a **load balancer** (scaling **out**). Capacity grows almost linearly for stateless parts, and you get redundancy too: one copy can fail while others keep serving. It requires servers that keep no state of their own (see below).

### Autoscaling

The platform adds and removes instances based on a metric: CPU, request rate, queue length. Serverless platforms do this automatically ([deployment models](/delivery/deployment-models/)). Keep in mind:

- it reacts in seconds to minutes, so a sudden spike can arrive before the new capacity; for known events, scale up in advance;
- set a minimum and a maximum;
- scaling one tier moves the pressure to the next: ten times more app servers means ten times more connections to the same database.

## Load balancing

A **load balancer** receives all requests and spreads them across instances:

- **Health checks** remove broken instances from the rotation.
- It often terminates TLS, and can route by path or header when it works at the HTTP level (layer 7), or only forward connections when it works at the TCP level (layer 4).
- **Algorithms**: round robin (in turn), least connections, weighted, and hashing (the same key always goes to the same instance, useful for caches).

**Sticky sessions** (sending a user to the same instance every time) are a workaround for state kept in memory. They make load uneven and lose the user's state when that instance dies. Prefer stateless servers.

Balancing happens at several levels: [DNS](/web-platform/dns/) or anycast spreads users across regions ([how users reach a PoP](/web-platform/cdn/#mental-model-a-reverse-proxy-in-front-of-everything)), a load balancer spreads requests inside a region, and services balance calls to each other.

## Stateless servers, state elsewhere

Horizontal scaling works when **any instance can handle any request**. So state moves out of the app servers:

- sessions to a database, Redis or signed cookies ([sessions](/security/auth/#sessions-in-practice-the-lifecycle));
- files to object storage;
- shared cache to Redis or similar;
- scheduled and long work to a queue.

See [what survives a restart](/delivery/deployment-models/#state-what-survives-a-restart). The state doesn't disappear: it moves to the data layer, and that becomes the hard part to scale.

## Scaling the data layer

Cheapest steps first:

1. **Fix queries**: indexes, no [N+1](/architecture/api-styles/#how-they-compare) (loading related rows one query at a time), no unbounded queries; pool connections.
2. **Cache reads**: in Redis next to the app, and at the CDN for public responses.
3. **Read replicas**: copies that serve reads. The price is replication lag and stale reads ([consistency](/data/consistency/#copies-and-consistency-models)).
4. **A bigger primary**: vertical scaling takes the write side very far.
5. **Split by workload**: analytics to a warehouse, search to a search engine, each service's data in its own database.
6. **Sharding**: split data by a key (a tenant, meaning a customer organization, or a user) across several primaries. Choose a key that keeps most queries inside one shard. Resharding later is hard, and many apps never need it.

**Writes are harder to scale than reads.** Reads can be served from copies, but conflicting writes to the same data must be put in one order: by one leader that owns that data, by coordination between copies (which costs latency), or by accepting conflicts and resolving them later ([consistency](/data/consistency/)).

Watch for **hot spots**: one product on sale, one celebrity account, one popular cache key. All the load lands on one shard or one key, however many machines there are. For hot **reads**, replicating the hot data and collapsing identical requests into one ([request coalescing](/architecture/caching/)) help. Hot **writes** are harder: replicas don't help, because one place still owns the record. Spread the writes over several keys when the meaning allows (a counter split into ten parts that are added up on read), or queue them and process them in order, with limits.

## Going global

For users around the world, scale in this order:

1. Static files and cacheable pages on a CDN: most of the latency benefit, little complexity.
2. App servers in several regions, with **read replicas** in each region. Writes still go to one primary region.
3. Data **partitioned by region** (EU users' data in the EU), which also helps with data-residency laws.
4. **Writes in every region.** Either **coordinated** (regions agree before a write is confirmed: data stays strongly consistent, but each write waits for a cross-region round trip), or **independent** (each region confirms at once, and conflicting writes are resolved later). The most complex option either way.

Each step adds cost and consistency problems. One region plus a CDN serves most apps well.

## Typical failures

- **Scaling the wrong tier.** More app servers while the database is the bottleneck: more connections, worse results.
- **In-memory state** that breaks as soon as a second instance appears.
- **Connection pool exhaustion.** 50 instances × 20 connections = 1,000 database connections.
- **Autoscaling without limits**, which overloads the database or produces a huge bill; or scaling that is too slow for a known spike.
- **[Retry storms](/architecture/reliability/#retries-bounded-spaced-and-safe)**: clients retry failed requests at once and multiply the load on a system that is already struggling.
- **Hot keys and hot shards.**
- **Unbounded queries and exports** without pagination.
- **Sharding or [microservices](/architecture/application-boundaries/) "for scale"** long before the numbers need them.
- **No load testing.** The first real test is the biggest sales day.

## How to choose

1. **Measure**: where is the bottleneck, and what load do you expect at peak and in a year?
2. **Do less work**: cache, CDN, precompute, fix queries.
3. **Make the app tier stateless** and scale it horizontally behind a load balancer, or use a platform that does it for you.
4. **Scale the database up**, pool connections, and add read replicas for read-heavy load.
5. **Split workloads**: search, analytics and background work go to their own systems.
6. **Shard or go multi-region** only when the numbers demand it.

Plan headroom for peaks, and load-test before big events.

## Landscape

- **Load balancers:** Nginx, HAProxy, Envoy, Traefik; cloud load balancers (AWS ALB and NLB, Google Cloud Load Balancing, Azure Front Door), Cloudflare Load Balancing.
- **Autoscaling:** [Kubernetes](/delivery/kubernetes/) Horizontal Pod Autoscaler, KEDA (scaling by queue length and other events), cloud autoscaling groups; serverless platforms scale on their own.
- **Data:** Redis and Valkey, Memcached, read replicas in managed databases, connection poolers (PgBouncer, Amazon RDS Proxy, Supavisor), sharding layers (Vitess for MySQL, Citus for PostgreSQL).
- **Load testing:** k6, Gatling, Locust, Apache JMeter, Artillery.
- **Learning:** the System Design Primer.
