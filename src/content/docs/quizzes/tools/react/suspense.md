---
title: React Suspense — check yourself
description: Scenario questions about what makes a boundary wait, where to put boundaries, transitions and errors.
quizFor: tools/react/suspense
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. The fallback never shows

A developer wraps a `UserCard` in `<Suspense fallback={<Spinner />}>` (the fallback is the loading placeholder shown instead of the content). `UserCard` fetches its data in `useEffect` and stores it in state. While the data loads, the card renders empty, and the spinner never appears. Why?

<details>
<summary>Answer</summary>

`<Suspense>` (a boundary that shows a fallback while something inside it isn't ready) only notices things React can wait for: code loaded with `lazy`, a Promise read with `use`, data from a Suspense-enabled library or framework, and HTML still streaming from the server. A fetch in `useEffect` is none of these: the component has already rendered, empty, before the effect even starts.

Either keep the component's own loading state, or switch to a Suspense data source: `useSuspenseQuery` in TanStack Query or [Apollo Client](/tools/apollo/cache/), data passed down as a Promise from a [Server Component](/tools/react/server-components/) (a component that runs on the server) or a router loader and read with `use`. The second option also lets you start the fetch earlier, outside the component.

</details>

## 2. A refetch loop with `use`

To try Suspense, a developer writes `const user = use(fetch('/api/me').then(r => r.json()))` inside a component. The page keeps flickering and the Network tab shows endless requests to `/api/me`. What is wrong?

<details>
<summary>Answer</summary>

Every render creates a **new Promise**. React suspends on it; when it resolves, React renders again, the render creates another new Promise and starts another request, and React suspends again.

The Promise must keep the **same identity** for the same data across renders: create it before rendering (in a router loader, or in a Server Component and pass it down as a prop), or take it from a library's cache, which returns the same Promise for the same key.

</details>

## 3. One spinner for the whole page

A dashboard has a header, a sidebar, a main chart and a slow "recent activity" panel. Version A has one boundary around the whole page: users stare at a full-page spinner for two seconds. Version B wraps each of twelve widgets in its own boundary: content pops in piece by piece and the layout jumps. Where would you put the boundaries?

<details>
<summary>Answer</summary>

Where you put a boundary is **what the user sees while waiting**. Design a loading sequence instead of either extreme:

- the header and sidebar render at once (no boundary needed if their data is fast or static);
- one boundary around the **main content**, so the chart and the widgets that load together appear together;
- a separate boundary for the **slow panel**, so it doesn't hold the rest back.

Make each fallback the same size as the content it replaces, so nothing jumps ([CLS](/observability/web-vitals/#cls-how-stable-the-layout-is), a score for unexpected layout movement). React also throttles how often it reveals content, so boundaries that become ready close together often appear together.

</details>

## 4. Results disappear on every filter change

On a search page, results are read with Suspense. Every time the user changes a filter, the visible results are replaced by the fallback spinner until the new results arrive, which feels like a step backwards. How do you keep the old results visible?

<details>
<summary>Answer</summary>

Content that is **already visible** and suspends again is replaced by the fallback, unless the update is marked as non-urgent:

- wrap the filter change in **`startTransition`** (or use `useTransition`): React keeps showing the old results while the new ones load, and the `isPending` flag from `useTransition` lets you show a small indicator, such as dimmed results;
- or use **`useDeferredValue`** for the query the results depend on, so the list lags behind while the filter control updates at once.

Keep the input itself urgent; only the expensive UI that depends on it should wait. Routers built for Suspense already wrap navigations in a transition.

</details>

## 5. One broken widget, a broken page

A "weather" widget on the home page sometimes fails to load its data, and when it does, the whole page shows an error screen. The widget is inside its own `<Suspense>` boundary. Why doesn't that help?

<details>
<summary>Answer</summary>

Suspense handles **"not ready yet"**, not **"failed"**. A failed load (for example a rejected Promise read with `use`) is thrown as an error and goes up to the nearest **error boundary**. If the nearest one is at the page level, the whole page shows the error.

Put an error boundary around the widget, with its own small fallback ("Weather unavailable") and a "try again" button that resets the boundary and fetches again. Wrap the parts of the UI that should fail independently; let truly critical failures go up to the page.

</details>
