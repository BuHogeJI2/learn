---
title: Client and server state
description: Who owns each piece of state, where it should live, and how the client stays in sync with the server.
related:
  - architecture/rendering
  - architecture/api-styles
  - architecture/caching
officialDocs:
  - title: React — Managing State
    url: https://react.dev/learn/managing-state
  - title: React — useOptimistic
    url: https://react.dev/reference/react/useOptimistic
  - title: TanStack Query — Does this replace client state?
    url: https://tanstack.com/query/latest/docs/framework/react/guides/does-this-replace-client-state
  - title: Apollo Client — Caching overview
    url: https://www.apollographql.com/docs/react/caching/overview
---

## What problem it solves

Most frontend bugs are state bugs: data that is out of date, two copies that disagree, a filter lost on reload, a back button that doesn't restore the view, input lost after an error. And most frontend complexity comes from choosing the wrong place for state.

The fix starts with one question: **who owns this piece of state?** Once that is clear, the right place and tool usually follow.

## Mental model: the owner decides

| Kind | Owner (source of truth) | Lifetime | Examples | Typical home |
| --- | --- | --- | --- | --- |
| **UI state** | The component | While it is on screen | An open dropdown, hover, the current step of an animation | Local component state |
| **Shared client state** | The app in this tab | The session | Theme, a multi-step wizard, selected rows | Context or a store |
| **URL state** | The URL | Shareable, part of history | Filters, sorting, page number, search query, active tab | The router's path and query parameters |
| **Server state** | The server and its database | Persistent, shared between users | Products, profile, orders | A server-state cache, or rendering on the server |
| **Persisted client state** | The device | Across visits | Preferences, unsent drafts | `localStorage`, IndexedDB |
| **Form state** | The user, until submit | Until submit | Field values, validation errors | Native forms or a form library |

The most important line is **server state**. In the browser, server data is **always a copy** of something you don't own:

- it can become **stale** at any moment, because someone else changed it;
- it needs **loading and error states**;
- it needs **refetching** and **invalidation** after changes;
- several components want the same data without requesting it several times.

That is a [cache](/architecture/caching/), with all its questions about keys and freshness. If you put server data into a general-purpose store, you end up building that cache by hand. That is why dedicated server-state libraries exist, and why moving data fetching to the server is attractive.

## One source of truth, everything else derived

Each piece of information should have **exactly one owner**. Everything else is computed from it during rendering.

Typical violations:

- Copying props into local state. The copy stops following the prop.
- Storing both `items` and `filteredItems`. Filter during rendering instead.
- Mirroring URL parameters into a store. Now there are two sources; the back button changes one, and the other stays wrong.
- Keeping the "current user" in a store *and* in the server-state cache. They will drift.

## The URL as state

Put state in the URL when it should **survive a reload**, be **shareable** as a link, or work with **back and forward**: filters, sorting, pagination, the search query, the active tab, sometimes an open dialog.

Benefits for free: deep links, history, and the server can read the URL and [render](/architecture/rendering/) the right result on the first request.

Keep out of the URL: secrets (URLs end up in logs and history), purely transient UI state, and large data. Remember that HTTP and CDN caches usually use the URL as their cache key, so very variable URLs lower the hit rate (the share of requests the cache answers). The part after `#` (the fragment) is an exception: it never reaches the server, so only the browser can read it.

## Staying in sync with the server

### Reading

A server-state library keeps fetched data under a **key** and decides when to fetch again: when the data is older than its freshness time, when the window gets focus again, when the network comes back, on an interval, or when you invalidate it.

Two cache designs:

- **Document cache** (TanStack Query, SWR): each request result is stored under its own key, such as `['orders', 42]`. Simple and predictable. After a change, you invalidate the keys that might be affected.
- **Normalized cache** (Apollo Client, Relay): results are split into **entities** by type and ID. If an order appears in a list and in a detail view, it is stored once, so updating it updates both views. This is more powerful, but adding or removing items from lists still needs manual work.

### Writing

After a mutation, the client must show the new truth. There are three options:

1. **Invalidate and refetch** the affected data. It is simple and correct, but costs an extra request and a short delay.
2. **Update the cache from the response.** It is precise and fast, but you must know exactly what changed.
3. **Update optimistically.** Change the UI immediately, as if the server already agreed, and roll back if it fails.

Optimistic updates fit actions that **almost always succeed** and are **cheap to undo**: likes, toggles, reordering, renaming. They are a bad fit for payments, for actions with server-side validation that often fails, and for data that others edit at the same time. Without a rollback, the UI lies.

### Concurrent changes

Two tabs or two users change the same record. The simplest rule is **last write wins**, and it silently loses data. The database side is in [Data consistency](/data/consistency/#concurrent-writes-and-isolation). Alternatives:

- **Version checks**: send the version you started from (an `ETag` with `If-Match`); the server refuses with `412` if someone changed it in between.
- **Merging**, up to collaborative data types (CRDTs, conflict-free replicated data types) that merge edits automatically, as in collaborative editors.

The user who made a change must see it right away, even if other users see it a bit later. This guarantee is called **[read-your-own-writes](/data/consistency/#copies-and-consistency-models)**.

## Server state with server rendering

Classic SSR still sends the data to the browser: the components hydrate there and need the same data, so it is **serialized into the HTML**. A server-state library can be seeded from it, so it doesn't fetch the data again at once, but you set this up yourself (TanStack Query's SSR guide shows how).

With **Server Components**, data used only by server components **never becomes client state**. The browser receives the rendered result, and a client cache is needed only for the interactive parts. Frameworks built on them usually change how writes work too: a mutation **invalidates server caches** and refreshes the route, instead of patching a client cache. See [Next.js caching](/tools/nextjs/caching/#the-four-cache-questions-answered-by-nextjs) for one implementation.

## Typical failures

- **Server data in a global client store.** You rebuild a cache by hand, without staleness or invalidation.
- **Two sources of truth** for the same value (store and URL, prop and state).
- **Optimistic updates without rollback.**
- **Missing loading, error and empty states.** The happy path works; everything else shows a blank area or wrong data.
- **Race conditions.** While typing in a search box, an older, slower response arrives after a newer one and overwrites it. Cancel old requests (`AbortController`) or ignore outdated responses; server-state libraries do this by key.
- **Everything global.** Every piece of state in one store makes unrelated components re-render together and couples features.
- **Sensitive data in `localStorage`.** Any script on the page can read it, including one injected through [XSS](/security/web-attacks/#xss-data-that-becomes-code).

## How to choose

```
Does it come from the server? ───── yes ──► server-state cache, or render it on the server
        │ no
Should it survive reload or be shareable? ── yes ──► the URL (or browser storage, if it belongs only to this browser and isn't sensitive)
        │ no
Is it needed by distant components? ─ yes ──► shared store or context
        │ no
        └──────────────────────────────────► local component state
```

## Landscape

- **Server state:** TanStack Query, SWR, Apollo Client, Relay, urql, RTK Query; framework data loading with Server Components and server caches, as in Next.js.
- **Client state:** React state and context, Zustand, Redux Toolkit, Jotai, MobX, XState (state machines), signals (Preact, Solid, Angular, Vue refs).
- **URL state:** router search parameters, nuqs, TanStack Router's typed search parameters.
- **Forms:** native forms with server actions, React Hook Form, TanStack Form.
- **Sync engines and local-first:** Zero and Replicache, ElectricSQL, CRDT libraries such as Yjs and Automerge.
