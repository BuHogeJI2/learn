---
title: Application boundaries — check yourself
description: Scenario questions about monoliths, services, data ownership and micro-frontends.
quizFor: architecture/application-boundaries
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Microservices from day one

A six-person startup is building its first product. The domain is still changing every month. The CTO wants microservices from the start, "so we never have to rewrite". What do you recommend?

<details>
<summary>Answer</summary>

Start with a **modular monolith**: one deployable app, split into modules with explicit APIs and their own tables, with the rules checked by tooling. With an unclear domain, the first boundaries are usually wrong. Inside a monolith, moving a boundary is a refactoring; between services, it is a change to network APIs, data migrations and deployments.

Microservices pay off for many teams that need independent releases, and they cost a lot to run: network failures, no cross-service transactions, [distributed tracing](/observability/logs-metrics-traces/) to follow one request across services, API versioning. A six-person team gets the costs without the main benefit. Extract a service later for a concrete reason (different scaling, isolation for payments, a team that needs its own release schedule).

</details>

## 2. A column rename that broke another team

The users team renamed a column in their table. The orders service, owned by another team, broke in production, because it reads the users table directly for reports. Both services were "independent microservices". What is the real problem?

<details>
<summary>Answer</summary>

The services share **data**, not only a database server. Reading another service's tables is hidden coupling: the table structure became a contract that nobody declared, so a private change in one team broke the other. This is a step toward a **distributed monolith**.

Fix the boundary: the users service owns its data, and others use its **API** (or events it publishes, see [messaging](/architecture/background-jobs/#three-shapes-of-messaging)). If the orders service needs user data for reports, it can keep its own copy, fed from the users service's events, or reports can move to an analytics store (a separate database built for large reports). Sharing a database server is fine; sharing tables is the problem.

</details>

## 3. Twenty calls per request

A product page request makes 20 synchronous calls to other services, one after another, and each must succeed. Each service has 99.9% availability, and their failures are mostly independent (different machines, different causes). Users see more errors than anyone expected. Why, and what can you do?

<details>
<summary>Answer</summary>

**Availability multiplies down** when every call is required: with independent failures, 0.999²⁰ ≈ 0.98, so about 2% of page requests fail even though every service looks healthy. (If failures are correlated, for example all services share one database, the real number differs; the lesson is that required dependencies add risk.) Latency adds up too: sequential calls sum, while parallel calls cost only the slowest one.

Options:

- Make some calls **optional**: if recommendations fail, show the page without them (a fallback, see [circuit breakers and fallbacks](/architecture/reliability/#circuit-breakers-and-fallbacks)), and give each call a timeout.
- Run independent calls **in parallel** and give each a deadline.
- Reduce the number of calls: merge data that is always used together, or keep a local copy of rarely changing data.
- Ask whether the boundaries are right: many calls across a boundary for one request usually mean the line is in the wrong place.

</details>

## 4. Two frontend teams want micro-frontends

A web app is built by two frontend teams: one owns checkout, the other owns the catalog. They step on each other in releases, and someone proposes micro-frontends. Is it a good idea?

<details>
<summary>Answer</summary>

Maybe, but first try cheaper options. Micro-frontends solve an **organizational** problem (teams that need independent releases of one UI), and they cost duplicated dependencies, a less consistent UX, harder shared state and often worse performance.

Cheaper steps: clear module boundaries and code owners in one app, a faster [pipeline](/delivery/ci-cd/), or feature flags (code switched on or off without a deploy) so each team can release its part without waiting. If independent deployment is still needed, split **by route**: checkout and catalog are separate pages, so each team can deploy its own app behind the same domain. Splitting one page into parts from different deployments is much harder; avoid it unless you really need it.

</details>

## 5. Splitting by layers

A team plans to split its monolith into a "frontend service", an "API service" and a "database service". What is the risk of this split?

<details>
<summary>Answer</summary>

It splits by **technical layer**, not by **business capability**. A separate frontend and backend is a normal, valid setup. The risk is calling these tiers independent services and expecting the benefits of microservices: most features touch all three layers, so a feature that changes the contract between them needs coordinated changes and releases, with network calls in between, and the boundaries don't match how the business and the teams are organized.

Split along business capabilities and data ownership instead (catalog, orders, payments): each part has its own UI or API, logic and data, and most calls stay inside it. If the real goal is different (for example, scaling the API separately from rendering), name that goal and check whether running more copies of the monolith already solves it.

</details>

## 6. "We moved to serverless, so now we have microservices"

A team moved its app from one server to dozens of [serverless functions](/delivery/deployment-models/#deployment-models) (code the platform starts on demand), one per API route. The functions are built from one codebase, read and write the same tables, and are deployed together. They say the system is now microservices. Is it?

<details>
<summary>Answer</summary>

No. **Serverless is a deployment model, not an architecture.** The code is one codebase, the functions share the same tables and are released together, so architecturally it is still a monolith (which is fine), now deployed as many functions.

The three boundaries are separate questions: how the code is split into modules, what is deployed together, and who owns which data. Changing one doesn't change the others. Calling it microservices can lead to wrong decisions, such as adding cross-function network calls or "service" versioning that brings costs without independent teams or data.

</details>
