---
title: React Suspense
description: What a Suspense boundary does and doesn't do — what can make it wait, transitions, errors, streaming SSR and selective hydration — and how it maps to rendering strategies.
concept: architecture/rendering
related:
  - architecture/state
  - observability/web-vitals
verified:
  date: 2026-10-29
  versions:
    react: 19.3.1
officialDocs:
  - title: React — Suspense
    url: https://react.dev/reference/react/Suspense
  - title: React — use
    url: https://react.dev/reference/react/use
  - title: React — useTransition
    url: https://react.dev/reference/react/useTransition
  - title: React — useDeferredValue
    url: https://react.dev/reference/react/useDeferredValue
  - title: React — lazy
    url: https://react.dev/reference/react/lazy
---

## The idea

A `<Suspense>` boundary is a **loading placeholder for a part of the tree**. While something inside it that React can wait for (see below) isn't ready, React shows the `fallback` (the loading UI you pass in); when everything inside is ready, React reveals the content at once.

Suspense **coordinates loading UI**. It doesn't fetch data, [cache](/architecture/caching/) it or handle errors; other pieces do that, and Suspense reacts to them.

## What can make a boundary wait

According to the React docs, a boundary waits for:

- component code loaded with `lazy`;
- a Promise read with `use`, including data streamed from [Server Components](/tools/react/server-components/) or loaded through a Suspense-enabled framework or library;
- stylesheets rendered with `<link rel="stylesheet">` and a `precedence` prop;
- during streaming server rendering, HTML that hasn't arrived yet.

It does **not** notice data fetched in `useEffect` or in event handlers: such a fetch never activates the fallback, so that component has to manage its own loading state. Ordinary images and fonts don't hold a boundary either.

Data libraries plug in through these mechanisms: TanStack Query and Apollo Client have `useSuspenseQuery`, Relay is built around Suspense, and frameworks pass Promises from their loaders or Server Components. If you call `use` yourself, the Promise must keep the **same identity** across renders for the same data: create it before rendering (in a loader, or passed down from the server) or take it from a library's cache. A new Promise object on every render makes React suspend again and again, and if creating it also starts a request, it fetches again too.

## Boundaries are a design decision

- **Components under the same closest boundary appear together.** Nest boundaries to define a loading sequence: page shell → main content → comments.
- **Where you put a boundary is what the user sees while waiting.** Too high, and the whole page becomes one spinner; too fine-grained, and pieces pop in one by one and shift the layout ([CLS](/observability/web-vitals/#cls-how-stable-the-layout-is), layout shift). Make fallbacks the same size as the content they replace.
- React reveals suspended content **at most once every 300 ms**, so boundaries that become ready close together appear together.

## Updates: transitions keep what is already shown

When content that is **already visible** suspends again (the user navigates to another page or changes a filter), React would normally replace it with the fallback, which feels like a step backwards. Two tools prevent that:

- **`startTransition` / `useTransition`**: mark the update as non-urgent, and React keeps showing the old UI. The `useTransition` hook also returns an `isPending` flag for a small indicator. Routers built for Suspense wrap navigation in a transition for you. (A boundary that gets a new `key` still resets, on purpose.)
- **`useDeferredValue`**: let part of the UI lag behind, for example search results that keep showing the previous query's results while the new ones load.

Urgent updates, such as typing into an input, keep their priority: keep the input's own state urgent, and let the expensive UI that depends on it be deferred. Newly added nested boundaries still show their own fallbacks.

## Errors are a separate boundary

Suspense handles **"not ready yet"**; an **error boundary** handles **"failed"**: it catches errors thrown while rendering its children, including a rejected Promise read with `use`, and shows its own fallback. Errors in event handlers and other callbacks aren't caught; handle them in code. Showing an error fallback doesn't retry anything: a "try again" button or the framework must reset the boundary and fetch again. Put error boundaries around the parts of the UI that should fail independently; without one near a widget, its error goes up to the next boundary, possibly the whole page.

## Suspense on the server

- **Streaming SSR** (server-side rendering). The server sends the page shell with fallbacks in place, then streams each boundary's HTML as soon as it is ready; a small script swaps it in ([streaming](/architecture/rendering/#streaming)). Boundaries are the units of streaming.
- **Errors inside a Suspense boundary during SSR** don't stop the stream: React sends that boundary's fallback in the HTML, and the client tries to render that part again (only client code: Server Component code never runs in the browser). An error in the shell itself, outside every boundary, leaves nothing to stream; the server must answer with an error page.
- **Selective hydration.** Each boundary hydrates on its own, and React hydrates first the part the user is interacting with ([hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready)).
- **Frameworks build on it.** In the Next.js App Router, a `loading` file becomes a Suspense boundary; with Cache Components enabled, parts of a page that need request-time data must sit inside one so that a static shell can be prerendered and sent first ([Next.js caching](/tools/nextjs/caching/)).

## Surprises

- **Fetching in `useEffect` doesn't activate the fallback.** It isn't a Suspense data source; that component shows its own loading state, or nothing.
- **A new Promise on every render** passed to `use` suspends again on every render, and refetches if creating it starts a request.
- **Waterfalls**: a parent suspends, and only after it resolves does its child start loading. Start fetches early (in a router loader, or as Promises passed down from the server) instead of inside each component.
- **Visible content re-suspends** and is replaced by the fallback unless the update is a transition or uses a deferred value.
- **A suspended subtree that never appeared keeps no state**; React renders it from scratch when it is ready.
- **Hidden content's layout effects are cleaned up** and run again when it is shown.

## How it maps to the concept

| Concept | In React |
| --- | --- |
| [Streaming](/architecture/rendering/#streaming) | Each Suspense boundary is a chunk that streams when ready |
| Selective hydration | Each boundary hydrates on its own, most urgent first; this changes when parts become interactive, not how much JavaScript ships |
| Loading states of [server state](/architecture/state/#reading) | A boundary with a fallback instead of `isLoading` flags in every component |
| A static shell with dynamic holes | The holes are Suspense boundaries (Partial Prerendering in Next.js) |
