---
title: "Apollo directives: @defer and others"
description: The three kinds of directives in an Apollo app — standard GraphQL ones, Apollo Client's own client-side directives, and incremental delivery with @defer and @stream — what each needs and where it runs.
concept: architecture/api-styles
related:
  - tools/apollo/cache
  - architecture/rendering
verified:
  date: 2026-10-29
  versions:
    "@apollo/client": 4.3.5
officialDocs:
  - title: Apollo Client — Directives
    url: https://www.apollographql.com/docs/react/data/directives
  - title: Apollo Client — Using the @defer directive
    url: https://www.apollographql.com/docs/react/data/defer
  - title: Apollo Client — Fragments and data masking
    url: https://www.apollographql.com/docs/react/data/fragments
  - title: Apollo Router — @defer support
    url: https://www.apollographql.com/docs/graphos/routing/operations/defer
  - title: GraphQL — Directives in queries
    url: https://graphql.org/learn/queries/#directives
---

## The idea

A **directive** is an annotation that starts with `@` and changes how part of a [GraphQL](/architecture/api-styles/) document is executed or processed. In an Apollo app there are three kinds, and the important question for each is **who handles it**: the server, the client, or both.

| Kind | Examples | Handled by |
| --- | --- | --- |
| **Standard GraphQL** | `@include`, `@skip` in queries; `@deprecated` in schemas | The server's GraphQL engine (and schema tooling) |
| **Apollo Client's own** | `@client`, `@export`, `@connection`, `@nonreactive`, `@unmask` | Apollo Client, locally; `@client` fields are never sent to the server |
| **Incremental delivery** | `@defer`, `@stream` | Both: the server must support it, and the client must understand the response format |

Servers can also define **custom schema directives** (for authorization, cost limits or federation, which combines several services into one graph, such as `@key` in Apollo Federation); those live in the schema and are the server's business.

## Standard directives

- **`@include(if: $flag)` and `@skip(if: $flag)`** include or drop a field depending on a variable, so one query document can serve several UI variants. The server evaluates them while executing (Apollo Client also takes them into account when reading the cache); the field stays part of the operation, and the variables choose. They are not an access control.
- **`@deprecated(reason: "…")`** marks a schema field as deprecated. Tools warn clients that still use it, which is how GraphQL APIs evolve without versions ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost)).

## Apollo Client's own directives

These are understood by Apollo Client, not by the server:

- **`@client`**: the field is resolved locally (local state or a computed value), not fetched. In Apollo Client 4 this needs a configured `LocalState`; the value can come from the cache, a field policy, a local resolver or a reactive variable. It lets one query mix server data and client data.
- **`@export(as: "name")`**: used together with `@client`; it puts a local field's value into a declared query variable before the server part of the operation runs.
- **`@connection(key: "…")`**: gives a field a stable cache key regardless of its pagination arguments, so the pages of one list are stored together; its `filter` argument keeps the arguments that make a list different (category, user) in the key. Field policies with `keyArgs` (the arguments that identify a list) in the [cache configuration](/tools/apollo/cache/#how-data-is-stored) are the recommended way to do the same, in one central place.
- **`@nonreactive`**: changes inside this field or fragment (a reusable set of fields) don't trigger an update of the query that contains it. It is meant for large lists: the parent query ignores changes to each item, and each item component reads its own fragment (with `useFragment`), so only the changed item re-renders. Without that second part, the UI goes stale.
- **`@unmask`**: with **data masking** turned on, a query result exposes only the fields it selects directly; fields that come from a fragment spread are read through that fragment (for example with `useFragment`). `@unmask` makes a spread's fields visible in the enclosing result, mainly while migrating an existing app. Masking organizes data dependencies; it hides nothing from the browser, since all fetched fields are still in the client and its cache.

## Incremental delivery: @defer and @stream

```
query ProductPage {
  product(id: 7) {
    name price                        ← arrives in the first part
    ... @defer { recommendations { … } }  ← arrives later, in the same response
  }
}
```

- **`@defer`** on a fragment lets the server send the response in **parts**: the fast fields first, the deferred fragment when it is ready, all in one HTTP response. It brings to API data what [streaming](/architecture/rendering/#streaming) brings to HTML: a slow field no longer holds back the whole screen.
- **`@stream`** on a list sends the first `initialCount` items first and the rest as they come.

What it takes, in Apollo Client 4:

- **An incremental handler must be configured.** Without one, a query that uses `@defer` or `@stream` fails. The delivery format is **not standardized yet**, and the handler must match your server's exact revision of it: for example, `Defer20220824Handler` matches Apollo Router's format, and `GraphQL17Alpha9Handler` matches the one in graphql-js 17.0.0-alpha.9. (`@stream` is supported since Apollo Client 4.1.)
- **The server must support it.** Apollo Router does, but some fields can't be deferred in its query plan and are resolved before the first part is sent, so support alone doesn't guarantee that a slow field leaves the critical path. For other servers, check.
- **The component must handle fields that haven't arrived.** In a `useQuery` result, while parts are still arriving, `dataState` is `"streaming"` and `loading` stays `true` until the last part. On the first load deferred fields are missing; on a refetch the previous values may still be there and get merged with the new parts. Show what has arrived: hiding everything until `loading` is false throws away the benefit.
- **Nothing in between may buffer the response.** A proxy or [CDN](/web-platform/cdn/) (servers between users and your origin) that waits for the whole response turns the parts back into one slow answer.

## Surprises

- **`@defer` alone does nothing portable.** Without a matching handler on the client and support on the server, it errors or breaks; it isn't a switch that makes any query stream.
- **Deferred fields can be `undefined` at first.** Make the generated TypeScript types reflect this (code generation for incremental delivery plus Apollo's matching type overrides); types don't change what arrives at runtime.
- **`@client` fields need setup and a source**: without a configured `LocalState` the operation fails, and without a value in the cache, a field policy or a resolver, the field is empty.
- **`@skip` and `@include` don't shrink the operation.** The skipped field is still part of the operation the server receives (as text, or as an ID with persisted queries); only the variable changes. Don't use them to hide data a user may not see.
- **Directives are part of the operation.** [Persisted queries](/architecture/api-styles/#how-they-compare) (operations registered on the server and sent by ID) and operation allow-lists include them, so changing a directive in the server-facing part changes the operation. Client-only parts are removed before sending, so changing those doesn't.

## How it maps to the concept

| Concept from [API styles](/architecture/api-styles/) | In Apollo |
| --- | --- |
| The client chooses the shape of the response | `@include` and `@skip` let one document cover several variants |
| A slow part shouldn't block the rest | `@defer` and `@stream` deliver the response in parts |
| Evolving a contract without breaking clients | `@deprecated` plus usage tracking |
| One place for server and client data | `@client` fields in the same query, next to server data in the [cache](/tools/apollo/cache/) or read from local state |
