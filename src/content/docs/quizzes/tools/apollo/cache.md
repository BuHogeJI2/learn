---
title: Apollo Client cache — check yourself
description: Scenario questions about normalization, mutations and lists, pagination keys, fetch policies and cache scope.
quizFor: tools/apollo/cache
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. The new task doesn't appear

A `createTask` mutation (a GraphQL operation that changes data on the server) succeeds and returns the new task with its `id`, but the task list on the screen doesn't show it until a reload. A teammate says Apollo's cache is broken. Is it?

<details>
<summary>Answer</summary>

No. The cache **merged the new task object** (it is stored under its cache ID, type plus `id`, such as `Task:91`; see [how data is stored](/tools/apollo/cache/#how-data-is-stored)), but it can't know which **lists** should contain it, in which position, or whether a filter includes it. List membership is your decision.

Options:

- an **`update` function** on the mutation that adds the task to the cached list (`cache.modify` or `cache.updateQuery`): no extra request, but you must keep the logic right for every list, filter and sort order;
- **`refetchQueries`** for the affected list query: simple and correct, at the cost of one more request and a short delay.

For deletions, the same applies: remove the object with `cache.evict` and clean up with `cache.gc`.

</details>

## 2. Renamed, but not everywhere

A `renameProject` mutation returns `{ success: true }`. After it, neither the project page nor the sidebar shows the new name. Another team's version returns the project, but in their app the sidebar still keeps the old name while the project page updates. What is going on in each case?

<details>
<summary>Answer</summary>

- **First case**: the response contains no project, so there is nothing to merge. Return the changed object with its identity field (`id`) and the changed fields, and every query that reads `Project:12` from the cache updates on its own.
- **Second case**: the sidebar query probably doesn't request `id` for the project (or the type is identified by another field without `keyFields`). Without an identity, that copy is stored **inside its parent** instead of normalized, so it is a separate copy that the mutation result doesn't touch. Request the identity fields in every query, and configure `keyFields` for types with custom IDs.

</details>

## 3. Two filters, one mixed list

A product list uses offset pagination (pages requested by position: items 0–19, 20–39…) with `offsetLimitPagination()` and a `category` argument. After switching from "Lamps" to "Chairs", the list shows lamps and chairs mixed together. Why?

<details>
<summary>Answer</summary>

`offsetLimitPagination()` uses **no key arguments** unless you pass them, so every call of that field, whatever the category, is stored as **one list**, and its `merge` function joins the pages into it.

Declare which arguments make a *different* list: `offsetLimitPagination(['category'])`, which sets `keyArgs`. The page offset and limit are not key arguments (they select a page of the same list), but filters, categories and sort orders are. The same applies to cursor pagination helpers and to custom `merge` functions.

</details>

## 4. The previous user's data

On a shared office computer, one employee logs out and another logs in without reloading the page. For a few seconds, the second employee sees the first one's notifications and name. Why, and how do you prevent it?

<details>
<summary>Answer</summary>

The cache belongs to a **client instance, not to a user**. With `cache-first` (the default fetch policy: answer from the cache when possible), queries answer from what is cached, so the next user is served the previous user's data until something replaces it.

On logout, login or account switch, **clear the cache**: `clearStore` (empties it) or `resetStore` (empties it and refetches active queries), and make sure the UI doesn't render cached data before that finishes. Better still, do a full page reload on logout. In multi-tenant apps (one app shared by many customer organizations, the tenants) where IDs can repeat across tenants, include the tenant in the cache identity.

</details>

## 5. Another user's cart in server-rendered HTML

In a Next.js app, the `ApolloClient` is created once at module level and used for [server rendering](/architecture/rendering/) too. Under load, some users see another user's cart in the first HTML. What is wrong?

<details>
<summary>Answer</summary>

On the server, a module-level client is **shared by every request** of that process, so its cache fills with data from many users and answers one user's query with another user's cached result. It is a [scope](/architecture/caching/#mental-model-four-questions-for-every-cache) mistake: personal data in a shared cache.

Create a **new client and cache per request** on the server, and pass the cache to the browser for [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready). Apollo's integration packages for Next.js and React Router do this for you. In the browser, one client per tab is fine, as long as you clear it on logout (question 4).

</details>

## 6. Old data after someone else's change

A project page uses the default fetch policy. Alice opens a project, goes to another page and comes back ten minutes later. Meanwhile Bob renamed the project from his own computer. Alice sees the old name, with no network request in the Network tab. Why, and what are your options?

<details>
<summary>Answer</summary>

The default **fetch policy** (the rule for choosing between the cache and the network) is `cache-first`: if everything the query needs is already cached, Apollo answers from the cache and doesn't ask the server. The normalized cache keeps Alice's own mutations correct, but it has **no freshness rule** for changes made elsewhere.

Options, per query:

- **`cache-and-network`**: show the cached result at once and ask the server too, then update. Fast and fresh soon after, at the cost of a request on every visit.
- **`network-only`**: always ask the server first. Always fresh, but every visit waits for the network.
- **Explicit refreshes**: `pollInterval` for data that changes often, `refetch` on window focus or on an event from a [real-time channel](/architecture/real-time/).

Choose by how much stale data costs on that screen, and keep `cache-first` where it doesn't matter.

</details>
