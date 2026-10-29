---
title: React Server Components
description: Components that run only on the server or at build time — how they differ from SSR, the client boundary and what can cross it, Server Functions, and where caching actually comes from.
concept: architecture/rendering
related:
  - architecture/state
  - tools/nextjs/caching
  - tools/react/suspense
verified:
  date: 2026-10-29
  versions:
    react: 19.3.1
officialDocs:
  - title: React — Server Components
    url: https://react.dev/reference/rsc/server-components
  - title: React — 'use client'
    url: https://react.dev/reference/rsc/use-client
  - title: React — Server Functions
    url: https://react.dev/reference/rsc/server-functions
  - title: React — 'use server'
    url: https://react.dev/reference/rsc/use-server
  - title: React — cache
    url: https://react.dev/reference/react/cache
  - title: React blog — Critical security vulnerability in React Server Components (December 2025)
    url: https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components
---

## The idea

**Server Components** render ahead of time, in an environment separate from the browser: once at build time, or on each request on a server. Their code is never sent to the browser; only their **output** is, as a serialized description of the UI (often called the RSC payload). They can be `async` and read data directly: `await db.notes.get(id)` inside the component.

**Client Components** are the familiar kind: their code ships to the browser, they [hydrate](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready) (attach event handlers to the server's HTML), and they can use state, effects and event handlers.

In a framework that supports them (the Next.js App Router is the main production one; others support them at different stages), components are Server Components **by default**, and `'use client'` marks where client code begins.

## Not the same as SSR

| | Classic hydrated SSR (server-side rendering, without Server Components) | Server Components |
| --- | --- | --- |
| Produces | HTML for the first page load | A serialized component tree, which SSR can then turn into HTML |
| Component code in the browser | All of it; hydration runs it again | Only the Client Components |
| Where it runs | On the server, then again in the browser | Only on the server or at build time |
| On navigation (with a client-side router) | The client fetches data and renders | The framework fetches the next route's RSC payload and merges it in; Client Components that stay on screen keep their state |

This compares the common React setup; server-rendered HTML can also be fully static. The two work together: an app with Server Components usually also uses SSR, so the first load is ready-made HTML ([rendering strategies](/architecture/rendering/)).

## The client boundary

```
Page (Server Component)               reads the database, ships no JS
 ├─ Article (Server Component)        ships no JS
 └─ LikeButton.tsx  'use client'      boundary: this module and everything
      │                                it imports become client code
      └─ children passed from the server: still rendered on the server
```

- `'use client'` at the top of a file marks **that module and everything it imports** as client code. It works on the import graph, not on the render tree.
- A Server Component can render Client Components and pass them props. A Client Component can't import server-only code (a component that reads the database, for example): whatever a client module imports becomes client code. It can **receive a Server Component as `children`** or another prop; the server renders it and passes the result. Server Functions are the exception: client code can import them and gets a reference that calls the server, not the function's code.
- Props that cross the boundary must be **serializable** (values React can encode on the server and rebuild in the browser): primitives, plain objects and arrays, `Date`, `Map`, `Set`, typed arrays, JSX, Promises (read on the client with `use`) and Server Functions. Ordinary functions and class instances can't cross.
- Server Components can't use state, effects, event handlers or browser APIs, and can't create context (they can render a provider from a Client Component).
- **Everything passed to a Client Component is sent to the browser.** Pass only the fields it needs, never secrets or whole database records. The `server-only` package makes a module fail to build if client code imports it.

## Server Functions: the other direction

An `async` function marked with `'use server'` can be **called from the client**: from a form, a button or any Client Component. The call is a network request: the arguments and the result are serialized, and the framework turns the function into an endpoint behind the scenes. Server Functions are meant mainly for mutations, not for loading data while rendering. That makes every Server Function a **public endpoint**, a form of RPC (remote procedure call: calling a function on another machine; [API styles](/architecture/api-styles/#how-they-compare)): validate its input and check permissions inside it ([authorization](/security/auth/#authorization-checking-what-is-allowed)).

A common confusion: `'use server'` marks Server Functions, **not** Server Components. Server Components have no directive.

Keep React and the framework patched. In December 2025, a critical flaw (CVE-2025-55182) in how the Server Components runtime decoded requests to Server Functions allowed remote code execution on unpatched servers, even in apps that had written no Server Functions of their own. It was in the `react-server-dom-*` packages that frameworks bundle, so updating only `react` was not enough; the first fixed versions were 19.0.1, 19.1.2 and 19.2.1. Follow your framework's security advisories for the current patched versions.

## Where data and caching live

Server Components define **where code runs**, not **what is [cached](/architecture/caching/)**:

- Without caching, a Server Component that fetches data does so every time it renders.
- React's `cache()` deduplicates calls within **one request**: several components that call the same `cache`-wrapped function with the same arguments (say, a user ID) share one query. Each call to `cache(fn)` creates its own cache, and arguments match by identity, so pass simple values, not freshly built objects.
- Caching across requests and users is the framework's job: in Next.js, `'use cache'` and Cache Components ([Next.js caching](/tools/nextjs/caching/)).
- After a mutation through a Server Function, your code calls the framework's APIs to invalidate the affected cache entries and refresh the UI that shows them ([server state with server rendering](/architecture/state/#server-state-with-server-rendering)). None of this is automatic: returning a result, refreshing the route and expiring cached data are separate steps.

## Surprises

- **`'use client'` doesn't mean "browser only".** Client Components are usually rendered to HTML on the server first, then hydrated, so browser-only APIs still belong in effects.
- **One `'use client'` in a module near the top** makes everything that module imports client code, and the bundle is large again (Server Components passed in as `children` still stay on the server).
- **Server modules imported by client code**: a database client in a client file either breaks the build or, worse, leaks; guard server modules with `server-only`.
- **Server waterfalls**: nested Server Components that `await` one after another make the request slow. Start independent fetches in parallel, or pass Promises down and read them with `use` inside [Suspense](/tools/react/suspense/) boundaries.
- **Overlap on the first load**: content rendered from props appears both in the initial HTML and in the RSC payload, which adds to the transfer size. Props the component never renders are still in the payload, so hiding a value from the page doesn't make it secret.
- **The APIs that bundlers and frameworks use** to implement Server Components don't follow semver (the rule that only a new major version may break things) within React 19, so frameworks pin exact React versions.

## How it maps to the concept

| Question from [Rendering strategies](/architecture/rendering/) | Answer with Server Components |
| --- | --- |
| Where is the HTML produced? | Server Components produce a UI payload on the server or at build time; an SSR step turns it into HTML for the first load |
| When? | At build time or per request, decided by the framework per route |
| How does interactivity arrive? | Only Client Components ship JavaScript and hydrate. `'use client'` decides which code ships, a bit like islands; when each part hydrates is scheduled by [Suspense](/tools/react/suspense/) |
| Where is the data read? | On the server, close to the database |
