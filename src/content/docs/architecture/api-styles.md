---
title: API styles
description: REST, GraphQL and RPC as three ways to shape a contract between parts of a system, and how contracts evolve without breaking clients.
related:
  - web-platform/http
  - architecture/state
officialDocs:
  - title: Roy Fielding — REST (dissertation, chapter 5)
    url: https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm
  - title: OpenAPI Specification
    url: https://spec.openapis.org/oas/latest.html
  - title: GraphQL — Learn
    url: https://graphql.org/learn/
  - title: gRPC — Introduction
    url: https://grpc.io/docs/what-is-grpc/introduction/
  - title: tRPC — Documentation
    url: https://trpc.io/docs
  - title: RFC 9457 — Problem Details for HTTP APIs
    url: https://www.rfc-editor.org/rfc/rfc9457
---

## What problem it solves

An API is a **contract** between parts that are built, deployed and changed separately: a frontend and a backend, two services, your system and a partner's. The contract says what a client may ask, what it gets back, and what errors look like.

The style of an API decides the shape of that contract, and through it:

- how many requests a screen needs,
- what caches, proxies and tools can understand without custom work,
- how errors are reported and retried,
- how hard it is to change the API later without breaking clients.

## Mental model: three ways to shape a contract

| Style | The client thinks in | Example | The contract is defined by |
| --- | --- | --- | --- |
| **Resource** (REST) | Nouns and standard verbs | `GET /orders/42`, `POST /orders` | URLs, [HTTP methods and status codes](/web-platform/http/#methods-what-a-request-promises); often described in OpenAPI |
| **Query** (GraphQL) | A graph of types; asks for exact fields | `{ order(id: 42) { total items { name } } }` | A typed schema |
| **Procedure** (RPC, remote procedure call) | Function calls | `orders.get({ id: 42 })`, `CreateOrder(request)` | Function signatures: Protocol Buffers (gRPC), TypeScript types (tRPC) |

The same data can be served in all three styles. The difference is **who decides the shape of the response**:

- In **REST**, the server decides the shape of each resource.
- In **GraphQL**, the client picks the fields it needs, within what the schema allows.
- In **RPC**, the server defines operations, and the API looks like the code behind it.

## How they compare

| | REST | GraphQL | RPC |
| --- | --- | --- | --- |
| Response shape | Fixed per resource | Chosen by the client | Fixed per procedure |
| Over- and under-fetching (too much data, or too many calls) | Common: screens need parts of several resources | Solved by design: one query, exact fields | Depends on how procedures are designed |
| HTTP caching | Native: `GET` URLs work with browser and [CDN caches](/architecture/caching/) | Weak by default: usually `POST` to one URL. Queries can be sent as `GET` and cached like any URL (persisted queries, saved on the server in advance and sent by ID, keep the URLs short and stable); otherwise a client cache does the work | Weak: usually `POST` |
| Errors | HTTP status codes plus a body, ideally in a standard format such as RFC 9457 | Usually `200 OK` with an `errors` list; partial data possible | Own status codes (gRPC has a fixed set) |
| Types and tooling | OpenAPI, then code generation | The schema is typed by design; code generation from it | gRPC: generated code for many languages; tRPC: shared TypeScript types, no generation |
| Browser support | Yes | Yes | tRPC and JSON-RPC: yes; gRPC needs gRPC-Web or Connect |
| Typical risks | Many endpoints to secure and keep consistent | Expensive or abusive queries; slow nested data loading (N+1); [access checks](/security/auth/#authorization-checking-what-is-allowed) per field | Tight coupling between client and server code |

The **N+1 problem** in GraphQL: a query for 50 orders with their customers can run 1 query for the orders plus 50 queries for the customers. A batching layer (DataLoader) collects them into one.

**Server actions** (framework-generated server functions, as in Next.js) are RPC in disguise: the framework creates a `POST` endpoint for each function. They are still public endpoints. Anyone can call them directly, so they need input validation and permission checks like any API.

## Evolution: the long-term cost

Writing an API is quick; changing it without breaking clients is the expensive part. This matters most when you don't control when clients update: mobile apps that users never update, partners, other teams.

**Usually safe (additive):**

- adding a new endpoint, field or optional parameter;
- adding a new value that clients are prepared to ignore.

**Breaking:**

- removing or renaming a field;
- changing a type or the meaning of a value;
- making an optional parameter required;
- changing error codes that clients react to.

Strategies:

- **Expand and contract**: add the new form, migrate clients, watch usage, and remove the old form only when nobody uses it.
- **Versioning**: `/v2/` in the URL or a version header. This is common for public REST APIs. GraphQL usually avoids versions: the schema evolves, and old fields are marked `@deprecated` and tracked until unused.
- **Tolerant readers**: clients ignore fields they don't know, so servers can add fields freely.
- **Contract checks in CI**: tools compare the new schema with the old one and fail on breaking changes (OpenAPI diff tools, GraphQL schema registries, `buf breaking` for Protocol Buffers).

## Error boundaries

Not all errors are the same, and the contract should make the difference clear:

| Kind | Example | What the client does |
| --- | --- | --- |
| Transport | No network, timeout | Retry, maybe |
| Protocol | `401`, `404`, `429`, `503` | React to the class: log in, show "not found", wait and retry |
| Domain | "Not enough stock", "Email already used" | Show a specific message; a retry won't help |

Good domain errors are **machine-readable** (a stable code), **human-readable** (a message) and point to the **field** that is wrong.

Retrying a `POST` is dangerous: if the first request actually succeeded and only the response was lost, a retry creates a second order. The usual fix is an **idempotency key**: the client sends a unique ID with the request, and the server ignores repeats with the same ID.

## Who the API is for

- **Public API for unknown clients:** stability and documentation matter most. REST with OpenAPI is the common denominator that every language and tool understands.
- **Your own frontend:** the API changes together with the UI. GraphQL, tRPC or framework server functions keep the two in step.
- **Service-to-service inside your system:** performance, strict types and streaming matter. gRPC is a common choice.
- **A [BFF](/architecture/application-boundaries/#where-the-frontend-fits-bff-gateway-micro-frontends)** (backend for frontend) is a thin server layer made for one client: it calls internal APIs and returns exactly what one screen or app needs.

## Typical failures

- **RPC dressed as REST.** `POST /getUser` and `POST /deleteUser` give you none of REST's caching or semantics. That is fine if it is a conscious choice, and confusing if it isn't.
- **GraphQL without limits.** A client can send a deeply nested query that takes the server down. Add depth and cost limits, or allow only known (persisted) queries.
- **N+1 queries** behind GraphQL resolvers or REST endpoints that load related data one row at a time.
- **Shipping a breaking change before clients are updated.**
- **`200 OK` with an error inside** for a REST API: monitoring sees success, and caches store the error.
- **Chatty APIs.** A screen needs 15 calls in a chain; each adds a round trip (the time for a request to reach the server and come back). Aggregate them on the server (BFF, GraphQL).
- **Exposing the database model.** Once clients depend on your table structure, you can't change the database.

## How to choose

- **A public API with many unknown clients:** REST with OpenAPI.
- **Many different clients that need different shapes of rich, connected data** (web and mobile apps, several teams): GraphQL.
- **Full-stack TypeScript, one team, frontend and backend in one repository:** tRPC or framework server functions.
- **Internal services in different languages, high load, streaming:** gRPC.

Styles mix well: gRPC between internal services, GraphQL or REST at the edge for clients.

## Landscape

- **REST:** OpenAPI (Swagger) for description and code generation; JSON:API as a response convention; frameworks such as Express, Fastify, Hono, NestJS.
- **GraphQL:** Apollo Server and Client, GraphQL Yoga, Relay, Hasura; Apollo Federation for combining schemas of several services.
- **RPC:** gRPC and Connect, tRPC, oRPC, JSON-RPC; server functions in Next.js and other frameworks.
- **Tools:** Postman, Bruno, Insomnia, GraphiQL. AsyncAPI describes event-based (message) APIs in the way OpenAPI describes HTTP APIs.
