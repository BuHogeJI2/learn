---
title: Application boundaries
description: How a system is split into parts — monolith, modular monolith, services — what each split costs, and where a BFF, an API gateway or micro-frontends fit.
related:
  - architecture/api-styles
  - data/consistency
  - security/auth
officialDocs:
  - title: Martin Fowler — Monolith First
    url: https://martinfowler.com/bliki/MonolithFirst.html
  - title: Martin Fowler and James Lewis — Microservices
    url: https://martinfowler.com/articles/microservices.html
  - title: Sam Newman — Backends For Frontends
    url: https://samnewman.io/patterns/architectural/bff/
  - title: Cam Jackson — Micro Frontends
    url: https://martinfowler.com/articles/micro-frontends.html
  - title: Martin Fowler — Conway's Law
    url: https://martinfowler.com/bliki/ConwaysLaw.html
  - title: Shopify Engineering — Deconstructing the monolith
    url: https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity
---

## What problem it solves

As a product grows, more people work on more code. Questions appear that code style can't answer:

- Who can change what without waiting for other teams?
- What must be deployed together?
- What fails together?
- Who owns which data?

**Boundaries** are the lines between parts of a system. With too few, everything is one tangle and every change touches everything. With too many, simple features need network calls between services, and failures spread in unexpected ways.

## Mental model: three kinds of boundaries

A boundary can exist at three levels, and they can be chosen separately:

1. **Code boundary** (module): which code may call which. Enforced by the language and tooling. Cheap to move.
2. **Deployment boundary** (deployable unit): what ships, scales and fails together. Each unit has its own [pipeline](/delivery/ci-cd/), version and runtime ([deployment models](/delivery/deployment-models/)).
3. **Data boundary**: who owns which tables. Other parts use the owner's API, not its database.

Above them sits **ownership**: which team is responsible. **Conway's law** says systems end up mirroring the communication structure of the organization that builds them, so team boundaries and system boundaries pull toward each other.

| | Monolith | Modular monolith | Services (microservices) |
| --- | --- | --- | --- |
| Code boundaries | Often weak | Strong, enforced by tooling | Strong: separate codebases or packages |
| Deployable units | One | One | Many |
| Data | One database, shared by all code | One database, tables owned by modules | Each service owns its data; others never read its tables directly (separate databases, or separate schemas on a shared server) |
| Calls between parts | Function calls | Function calls through module APIs | Network calls |
| Failure blast radius | A bug or overload can affect the whole app | Same as a monolith, with clearer ownership | Can stay inside one service, if others don't depend on it synchronously and handle its failures |
| Transactions across parts | Easy | Easy | Hard: [sagas and idempotency](/data/consistency/#across-services-no-shared-transaction) |
| Fits | One or few teams | Several teams, one product | Many teams that need independent releases |
| Operating cost | Low | Low | High: deployment, [monitoring, tracing](/observability/logs-metrics-traces/), versioning |

## Splitting options

### Monolith

One deployable application. Easy to develop, test, deploy and debug; refactoring across the whole codebase is a normal change; one database transaction covers everything. A monolith also scales further than people think: run several copies behind a [load balancer](/architecture/scaling/#load-balancing).

Monoliths get a bad name when they have no **internal** boundaries (a "big ball of mud"), not because they are deployed as one unit.

### Modular monolith

One deployment, but split into modules with explicit public APIs and their own data. Rules such as "the billing module may not import from catalog internals" are checked by tooling.

It gives most of the team benefits of services (clear ownership, independent work inside a module) without network calls, distributed failures or cross-service transactions. If a module later needs to become a service, the line to cut along already exists. Shopify's main application is a well-known example.

### Services and microservices

Independently deployable services, each built around a business capability (orders, payments, catalog) and owning its data.

Benefits:

- teams release on their own schedule;
- each service scales on its own, and its failures *can* stay contained, if the services that call it have [timeouts and fallbacks](/architecture/reliability/#timeouts-and-deadlines);
- each can choose the technology that fits it.

Costs:

- every call can be slow or fail, so you need [timeouts, retries and idempotency](/architecture/reliability/);
- no joins and no transactions across services;
- API changes between services must stay compatible: additive changes, deprecation periods and, when needed, versions ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost));
- debugging one user request means following it through many services, which needs [distributed tracing](/observability/logs-metrics-traces/);
- running everything locally becomes hard.

The worst case is a **distributed monolith**: services that must be deployed together, or that read and write each other's tables. You pay the costs of both styles and get the benefits of neither.

Note that **[serverless functions](/delivery/deployment-models/)** (code that the platform starts on demand, with no server running all the time) **are a deployment model, not an architecture**: a monolith can run as functions, and a service can run in a [container](/delivery/containers/).

## Where the frontend fits: BFF, gateway, micro-frontends

```
                       ┌──► Orders service
Browser ──► BFF (web) ─┼──► Catalog service
Mobile  ──► BFF (app) ─┼──► Users service
                       └──► …
```

- **API gateway**: one shared entry point in front of all services. It routes requests and handles common concerns such as checking credentials, [rate limiting](/architecture/reliability/#protecting-a-service-from-overload) (capping how often a client may call) and logging. It is generic and usually owned by a platform team.
- **BFF** (backend for frontend): a server layer **for one kind of client** (web, mobile app), usually owned by the team that builds that client. It calls several services and returns exactly what a screen needs, keeps tokens on the server ([where credentials live](/security/auth/#where-the-browser-keeps-credentials)), and often renders the HTML. In practice, the server of a full-stack framework such as Next.js often *is* the BFF. A GraphQL layer that combines several services is another way to compose APIs for clients ([API styles](/architecture/api-styles/)).
- **Micro-frontends**: the UI split into parts that different teams build and deploy independently, combined at build time, on the server or in the browser. The cheapest split is **by route** (each team owns whole pages); splitting one page into parts from different deployments is much harder. They solve an organizational problem: many teams working on one UI. The costs are duplicated dependencies, a less consistent UX, harder shared state and routing, and often worse performance. With one or two frontend teams, they usually cost more than they give.

## Typical failures

- **Microservices too early.** A small team with an unclear domain draws the boundaries in the wrong places, and moving them is now expensive because they are network APIs.
- **Splitting by technical layer** (a "frontend service", a "database service") instead of by business capability. Every feature then touches every service.
- **Services reading each other's tables.** Hidden coupling: one team's [schema change](/data/schema-evolution/) breaks another team's service. Sharing a database *server* is fine; sharing *tables* is the problem.
- **Chatty services.** One user request triggers twenty synchronous calls. Latency adds up, and availability multiplies down: if all twenty are required and fail independently, twenty services at 99.9% each give about 98% for the whole request.
- **A monolith with no internal boundaries**, then "fixing" it by splitting into services along the same tangled lines.
- **A shared "common" library** that every service depends on, so all services must be released together.
- **Micro-frontends for a single team.**
- **Each service checking permissions its own way.**

## How to choose

- **Start with a monolith, preferably a modular one.** Martin Fowler calls this "monolith first": you learn where the real boundaries are before you make them expensive to move.
- **Extract a service for a concrete reason:**
  - a part with very different scaling or reliability needs (video processing, search);
  - a team that needs its own release schedule;
  - isolation for security or compliance (payments);
  - a different technology that the main app can't use.
- **Draw boundaries along business capabilities and data ownership.** Domain-Driven Design calls such an area a **bounded context**: a part of the business where each term has one meaning ("product" in the catalog and "product" in the warehouse are different things). Aim for many calls inside a boundary and few across it.
- **For the frontend:** one app with good module boundaries by default. Add a BFF when clients need different data shapes or tokens should stay on the server. Use micro-frontends only when several teams truly need independent releases of one UI.

## Landscape

- **Module boundaries in one codebase:** Nx module boundary rules, dependency-cruiser, ESLint boundary plugins, Spring Modulith (Java), Packwerk (Ruby, from Shopify).
- **Communication between services:** REST, gRPC and GraphQL ([API styles](/architecture/api-styles/)), [message brokers](/architecture/background-jobs/), service meshes (Istio, Linkerd) that handle traffic, retries and encryption between services.
- **API gateways:** Kong, Amazon API Gateway, Apigee, Envoy-based gateways, Cloudflare.
- **BFF and API composition:** full-stack framework servers (Next.js, React Router, Nuxt, SvelteKit), Apollo Federation, Hive Gateway.
- **Micro-frontends:** Module Federation (webpack, Rspack), single-spa, Native Federation, iframes, web components.
