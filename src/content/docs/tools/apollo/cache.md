---
title: Apollo Client cache
description: How Apollo Client's normalized InMemoryCache stores GraphQL results, how fetch policies decide when to hit the network, and how to keep the cache right after mutations.
concept: architecture/state
related:
  - architecture/caching
  - architecture/api-styles
verified:
  date: 2026-10-29
  versions:
    "@apollo/client": 4.3.5
officialDocs:
  - title: Apollo Client — Caching overview
    url: https://www.apollographql.com/docs/react/caching/overview
  - title: Apollo Client — Customizing cache IDs
    url: https://www.apollographql.com/docs/react/caching/cache-configuration
  - title: Apollo Client — Customizing the behavior of cached fields
    url: https://www.apollographql.com/docs/react/caching/cache-field-behavior
  - title: Apollo Client — Queries (fetch policies)
    url: https://www.apollographql.com/docs/react/data/queries
  - title: Apollo Client — Mutations
    url: https://www.apollographql.com/docs/react/data/mutations
---

## The idea

Apollo Client, a [GraphQL](/architecture/api-styles/) client, keeps server data in a **normalized cache**: the `InMemoryCache`. It is the "normalized cache" design from [Client and server state](/architecture/state/#reading): results are split into entities by type and ID, each stored once, so a change to one object shows up in every query that contains it.

## How data is stored

A query result is broken into a **flat lookup table** of objects that point to each other:

```
query result                             cache
{ order(id: 42) {                        ROOT_QUERY: { order({"id":42}): → Order:42 }
    id                                   Order:42:   { id, total, customer: → Customer:7 }
    total                                Customer:7: { id, name }
    customer { id name } } }
```

- **Cache ID**: by default `__typename` plus `id` (or `_id`): `Order:42`. Types identified by other fields get `keyFields` in the cache configuration (for example a `Product` identified by its `sku`).
- **Objects without an identity** (no `id`, `_id` or configured `keyFields`) aren't normalized: they are stored inside their parent and reached only through it.
- **Merging**: when the same identified object arrives again, new values for its fields overwrite the old ones, and fields it didn't include are kept. Objects without an identity are not merged this way: a new nested object or array replaces the old one, so fields fetched by another query can disappear unless a custom `merge` function combines them.
- **Root fields** such as `order(id: 42)` live under `ROOT_QUERY`, keyed by field name and arguments.

**Field policies** (set per type, in the `fields` of `typePolicies`) customize single fields: a `read` function computes or formats a value, and a `merge` function decides how incoming data combines with what is cached. Pagination (loading a list page by page) is the main use, and it needs two settings: `merge` joins the pages into one list, and `keyArgs` says which arguments make it a *different* list. A page number or cursor is not a key argument, but a filter or a category is. Helpers such as `offsetLimitPagination` and `relayStylePagination` use no key arguments unless you pass them, so differently filtered lists would be merged into one. (The older [`@connection` directive](/tools/apollo/directives/#apollo-clients-own-directives) does the same job inside a query.)

## When the network is used: fetch policies

A **fetch policy** is the rule a watched query (such as `useQuery`) follows to choose between the cache and the network:

| `fetchPolicy` | Behavior |
| --- | --- |
| `cache-first` (default) | Answer from the cache; ask the server only if something requested is missing |
| `cache-and-network` | Answer from the cache at once (if everything requested is cached) *and* ask the server, then update |
| `network-only` | Always ask the server; store the result in the cache |
| `no-cache` | Always ask the server; don't read from or write to the cache, and ignore later cache updates |
| `cache-only` | Never ask the server |
| `standby` | Like `cache-first`, but don't update automatically when cached data changes |

`cache-first` means **no freshness rule**: once data is cached, it stays until something changes it. Choose a policy per query, or set `nextFetchPolicy` to behave differently after the first request (for example `cache-and-network` on first load, `cache-first` afterwards); when the variables change, the query normally starts again from its first policy. Polling (`pollInterval`) and `refetch` give time-based or manual refreshes.

## Keeping the cache right after mutations

A **mutation** is a GraphQL operation that changes data on the server. The usual question from [writing server state](/architecture/state/#writing), answered for Apollo:

- **The mutation returns the changed object** with its identity fields (usually `id`) and the changed fields: the cache merges it, and every active query that reads that object from the cache updates. No extra code.
- **List membership and order**: items added or removed, or an item whose change moves it into or out of a filtered or sorted list. The cache can't guess which lists are affected, and it doesn't recompute totals. Update them yourself with an `update` function (`cache.modify`, `cache.updateQuery`), or refetch the affected queries (`refetchQueries`).
- **Deletions**: remove the object with `cache.evict` and clean unreachable objects with `cache.gc`.
- **[Optimistic updates](/architecture/state/#writing)** (showing the expected result before the server confirms): `optimisticResponse` writes the expected result into a temporary layer of the cache at once; it is replaced by the real response or rolled back on error.

## Surprises

- **Missing identity fields in a query** stop normalization for that object: the same order reached through two different parents is stored twice, and the copies don't update each other. Request the fields the cache uses for identity (`id` by default) in queries and in mutation results; Apollo adds `__typename` itself.
- **Lists don't update after create or delete.** That is the most common "the cache is broken" report; the cache did exactly what it could.
- **No expiry.** With `cache-first`, data can stay stale for the whole session unless you choose another policy, poll or refetch.
- **Custom IDs need `keyFields`**, or objects of that type are stored inside their parents.
- **Fragments** (reusable sets of fields) **on interfaces and unions** (types that can be one of several object types) need `possibleTypes` in the cache configuration to match correctly.
- **The cache belongs to a client instance, not to a user.** After logout, login or a switch to another account or tenant, clear it (`clearStore`) or reset it (`resetStore`, which also refetches active queries), or the next user can see the previous user's data. If IDs repeat across tenants, the cache identity must include the tenant.
- **[Server rendering](/architecture/rendering/)**: create a new cache per request on the server, never share one between users ([scope](/architecture/caching/#mental-model-four-questions-for-every-cache)). Apollo provides integration packages for Next.js and React Router that transfer the cache to the browser.
- **Version 4 moved the React APIs**: hooks such as `useQuery` are imported from `@apollo/client/react`.

## How it maps to the concept

| Question from [Caching](/architecture/caching/) | Apollo's answer |
| --- | --- |
| Key | Cache ID (`__typename:id` or `keyFields`) for objects; field name plus key arguments for fields, on the root or on any object |
| Scope | One client instance in memory, not automatically one user; on the server, one request |
| Freshness | None by default; the fetch policy, polling and refetching decide |
| Invalidation | Mutation results merge automatically; lists and deletions need `update`, `evict` or `refetchQueries` |
