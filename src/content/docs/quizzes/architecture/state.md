---
title: Client and server state — check yourself
description: Scenario questions about where state lives, server-state caches, optimistic updates and races.
quizFor: architecture/state
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Filters that don't survive

A product list keeps its filters and sort order in a global store. Users complain: after a reload the filters are gone, a link sent to a colleague opens the unfiltered list, and the back button doesn't undo a filter change. What would you change?

<details>
<summary>Answer</summary>

This state should survive a reload, be shareable and work with history, so its owner is the **URL**: put filters, sort and page into query parameters, and read them from the router. Don't mirror them into the store as well; two sources of truth drift apart, and the back button changes only one.

Bonus: the server can read the URL and [render](/architecture/rendering/) the filtered list on the first request. The cost: very variable URLs lower the hit rate (the share of requests answered from cache) of HTTP and [CDN](/web-platform/cdn/) caches, and you need to parse and validate parameters that users can edit.

</details>

## 2. A hand-made cache

An app loads orders into a Redux store with `isLoading` and `error` flags for each request. Bugs pile up: data edited in another tab stays old until a reload, two components request the same data twice, and some screens show a spinner forever after an error. What is the root cause?

<details>
<summary>Answer</summary>

Server data was put into a **general-purpose client store**. But server data in the browser is a **copy**: it goes stale, needs loading and error states, refetching, deduplication and invalidation. The team is rebuilding a [cache](/architecture/caching/) by hand, one bug at a time.

Use a **server-state library** (TanStack Query, SWR, or [Apollo Client](/tools/apollo/cache/) for [GraphQL](/architecture/api-styles/) APIs), which keeps data under keys and deduplicates requests, and configure when it refetches: on window focus, on an interval, or after invalidation (marking cached data as outdated). Defaults differ between libraries, so check them. Or move the data loading to the server with [Server Components](/tools/react/server-components/) (components that run only on the server); then decide when already rendered data is refreshed (after a mutation, on navigation, or on a revalidation timer). Keep the store for real client state (a wizard, selected rows).

</details>

## 3. Optimistic, or not?

A team adds optimistic updates (showing the expected result before the server confirms it, and rolling back if it refuses) everywhere to make the app feel fast: the like button, renaming a folder, and "Pay now". Which ones are good candidates, and why?

<details>
<summary>Answer</summary>

Optimistic updates fit actions that **almost always succeed** and are **cheap to undo**:

- **Like**: yes. It rarely fails, and rolling back a heart icon is harmless.
- **Rename a folder**: usually yes, with a rollback and an error message if the server refuses (for example, a duplicate name).
- **Pay now**: no. Payments fail for many reasons (card declined, fraud checks), and showing "Paid" and then taking it back is confusing and can cause real harm. Show a pending state until the server confirms.

Every optimistic update needs a **rollback** path; without it, the UI lies.

</details>

## 4. Results for the wrong query

In a search box, the user types "apple" quickly. Sometimes the results shown are for "ap", even though "apple" was typed last. Why, and how do you fix it?

<details>
<summary>Answer</summary>

A **race condition**: each keystroke sends a request, and responses can arrive in a different order. The slower response for "ap" arrived after the response for "apple" and overwrote it.

Fixes: cancel the previous request when a new one starts (`AbortController`), or ignore responses that don't match the current query. Server-state libraries do this by key: the results are stored per query, and the UI shows the key that is current. Debouncing (waiting a few hundred milliseconds after typing) reduces the number of requests but doesn't remove the race on its own.

</details>

## 5. Renamed in one place, old in another

The app uses TanStack Query. A user renames an order on its detail page; the detail view updates, but the orders list still shows the old name until a reload. A teammate says, "This wouldn't happen with Apollo." Why does it happen, and are they right?

<details>
<summary>Answer</summary>

TanStack Query has a **document cache**: the list (`['orders']`) and the detail (`['orders', 42]`) are separate entries. Updating one doesn't touch the other. After the mutation, invalidate every key that may contain the order (here, both), or update both from the response.

The teammate is partly right. A **normalized cache** ([Apollo Client](/tools/apollo/cache/)) stores the order once by type and ID, so both views would update, provided the order has a stable cache identity (its type and ID) and the mutation's response includes the changed `name`. If the response returns only "success", Apollo keeps the old name too. And it doesn't solve everything: adding an order to a list, removing one, or changing which items match a filter still needs manual cache updates or refetching. The trade-off: a document cache is simpler and predictable; a normalized cache saves refetches but has more rules to learn.

</details>
