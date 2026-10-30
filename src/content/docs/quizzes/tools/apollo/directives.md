---
title: GraphQL directives in Apollo — check yourself
description: Scenario questions about who handles a directive, @defer in practice, @skip as access control and @nonreactive.
quizFor: tools/apollo/directives
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Adding `@defer` broke the query

To speed up a product page, a developer adds `... @defer { recommendations { … } }` (a fragment, a reusable set of fields, marked for later delivery) to the [GraphQL](/architecture/api-styles/) query. In an app on Apollo Client 4, the query now fails instead of loading faster. What is needed for `@defer` to work?

<details>
<summary>Answer</summary>

`@defer` (send the marked fragment later, in the same response) is handled by **both sides**, so both must be ready:

- **The client** needs an **incremental handler** (the client part that understands the format of the partial response) configured, and it must match the server's exact version of the delivery format, which is not standardized yet (for example `Defer20220824Handler` for the format of Apollo Router, Apollo's GraphQL gateway). Without one, Apollo Client 4 rejects such queries.
- **The server** must support incremental delivery. Apollo Router does; for other servers, check. Even with support, some fields can't be deferred in the router's query plan and are resolved before the first part is sent.

It isn't a switch that makes any query stream; it is a contract between a specific client setup and a specific server.

</details>

## 2. `@defer` works, but the page doesn't get faster

`@defer` is now configured on both sides, and in local development the Network panel shows the product part arriving first and the recommendations part later. In production, users still wait for everything. The component shows a spinner while `loading` is `true`. What could be wrong?

<details>
<summary>Answer</summary>

Two common causes:

- **The component waits for the last part.** While parts arrive, `loading` stays `true` (and `dataState` is `"streaming"`) until the final one. Hiding everything until `loading` is false throws the benefit away. Render what has arrived and show a placeholder only for the deferred fields, which may be `undefined` at first.
- **Something in between buffers the response.** A proxy or [CDN](/web-platform/cdn/) (servers between users and your app) in production that waits for the whole response before forwarding it turns the parts back into one slow answer. Local development has no such layer. Configure it to pass streamed responses through.

</details>

## 3. Hiding salaries with `@skip`

To keep employee salaries away from non-admins, the query uses `salary @skip(if: $isNotAdmin)`, with `$isNotAdmin` set by the frontend from the user's role. Is that a safe way to protect the data?

<details>
<summary>Answer</summary>

No. `@skip` and `@include` choose fields based on **variables the client sends**. Anyone can change the variable (or send their own query) and get the field. They are a way to reuse one query for several UI variants, **not access control**.

Protect the field on the **server**: the resolver (the server code that supplies the field's value) checks the caller's role and refuses or returns `null` for non-admins ([authorization](/security/auth/#authorization-checking-what-is-allowed)). Keep `@skip` in the UI if it helps to avoid requesting what won't be shown, but treat it as a convenience.

</details>

## 4. `@nonreactive` made the list go stale

A list of 2,000 items re-rendered completely whenever one item changed, so a developer added `@nonreactive` to the item fragment in the list query. Now edits to an item don't show up in the list at all. What was missing?

<details>
<summary>Answer</summary>

`@nonreactive` tells the parent query to **ignore** changes inside that fragment. That is only half of the pattern: each **item component** must read its own data from the cache with **`useFragment`** (by the item's cache ID, its type plus `id`; see the [Apollo cache](/tools/apollo/cache/#how-data-is-stored)), so the item, and only that item, re-renders when its data changes.

Without the second part, nothing watches the items any more, so the list shows stale data. With both parts, the list re-renders only when items are added, removed or reordered, and each edit re-renders one row.

</details>
