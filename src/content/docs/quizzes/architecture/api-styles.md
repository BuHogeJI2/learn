---
title: API styles — check yourself
description: Scenario questions about choosing REST, GraphQL or RPC, evolving a contract and protecting endpoints.
quizFor: architecture/api-styles
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. An API for partners

Your company opens its order data to partners. They write code in Java, Python, PHP and Go, and you will never meet most of them. Which API style do you choose?

<details>
<summary>Answer</summary>

**REST** (resources as URLs with standard HTTP methods) **with an OpenAPI description** (a machine-readable description of the endpoints) is the common denominator for unknown clients: every language and tool understands HTTP, status codes and JSON, `GET` responses work with HTTP caches, and OpenAPI gives documentation and generated clients.

GraphQL (one endpoint where the client asks for exactly the fields it needs) can work for partners too (GitHub and Shopify offer it), but it asks every partner to learn it, and you must protect the server from expensive queries. The RPC styles (calling server functions by name) fit worse: tRPC is tied to TypeScript, and gRPC needs extra layers in browsers. For a public API, stability and documentation matter more than flexibility, so also plan versioning from day one.

</details>

## 2. A rename that broke old apps

The backend renamed the `price` field to `amount` in a REST response and updated the web app in the same release. The next day, users of older mobile app versions see empty prices. What went wrong, and how should this be done?

<details>
<summary>Answer</summary>

Renaming a field is a **breaking change**, and the team doesn't control when mobile users update their apps. The web app was updated together with the backend; old mobile versions weren't.

Use **expand and contract**: add `amount` next to `price`, release clients that read `amount`, watch how many requests still use old app versions, and remove `price` only when no supported version relies on it: after the old versions are gone, or after a communicated end of support or a forced update. Low usage is evidence for that decision, not compatibility; removing the field earlier still breaks the remaining users, and the business should accept that on purpose. A contract check in [CI](/delivery/ci-cd/) (the automated checks that run on every change) that compares the new schema with the old one would have caught this before release. The cost: both fields live in the API for weeks or months.

</details>

## 3. One query took the server down

A public GraphQL API goes down. The logs show one client sending a query that nests `friends { friends { friends { … } } }` ten levels deep. What protections were missing?

<details>
<summary>Answer</summary>

GraphQL lets the client choose the shape, so the server must **limit what it accepts**:

- **Depth and cost limits**: reject queries that are too deep or would touch too many objects.
- **Persisted queries**: for your own apps, allow only queries that were registered in advance and are sent by ID. Unknown queries are refused.
- **Rate limits** per client, based on query cost, not only request count.
- **Batching** (DataLoader) against the N+1 problem (one query for a list, then one more query for each item in it): one database query per level instead of one per item.

The trade-off: limits can block legitimate complex queries, so tune them with real traffic. Allowing only persisted queries is the strongest option, but it works only for clients you control.

</details>

## 4. "Only our UI calls this"

A Next.js app has a server action `deleteProject(projectId)` (a server function the UI calls like a normal function, see [Server Functions](/tools/react/server-components/#server-functions-the-other-direction)). It is called only from a button that is shown to project owners, so the action doesn't check permissions. Is that acceptable?

<details>
<summary>Answer</summary>

No. A server action is **RPC in disguise**: the framework creates a public `POST` endpoint for it. Anyone who finds the endpoint can call it with any `projectId`, button or not.

Treat it like any API endpoint: validate the input, check that the caller is logged in and may delete *this* project ([authorization](/security/auth/#authorization-checking-what-is-allowed)), and return a clear domain error when not. Hiding the button is UX; the check inside the action is the security.

</details>

## 5. Twelve calls for one screen

A mobile product screen needs data from 12 REST endpoints, several of them in a chain (the product, then its seller, then the seller's ratings…). On a slow network the screen takes 4 seconds. What are your options?

<details>
<summary>Answer</summary>

The API is **chatty**: each call is a round trip (the time for a request to reach the server and come back), and chained calls add up. Options:

- A **[BFF](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends)** (a thin server layer for this app) that calls the 12 endpoints close to them, in parallel where possible, and returns exactly what the screen needs in one response. Your team owns it, and it can evolve with the app.
- **GraphQL**: one query asks for the product, the seller and the ratings together. Good when many clients need different shapes, but it is a bigger change and brings its own costs (query limits, N+1 batching).
- Add a few **aggregate endpoints** to the REST API. The quickest fix, but the API slowly fills with screen-specific endpoints.

</details>
