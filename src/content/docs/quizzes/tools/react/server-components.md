---
title: React Server Components — check yourself
description: Scenario questions about the client boundary, what reaches the browser, Server Functions and data freshness.
quizFor: tools/react/server-components
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A theme toggle doubled the bundle

To add a dark-mode toggle, a developer put `'use client'` at the top of the root `layout.tsx`, which imports the header, the navigation and the page sections. The JavaScript sent to the browser doubled. Why, and how should it be done?

<details>
<summary>Answer</summary>

`'use client'` marks **that module and everything it imports** as client code: it works on the import graph, not on the render tree. The layout imports most of the app, so most of the app became Client Components (code that ships to the browser and hydrates, meaning it attaches interactivity to the server's HTML, see [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready)) instead of Server Components (code that runs only on the server and ships no JavaScript).

Push the boundary down: put the toggle in its own small `ThemeToggle.tsx` with `'use client'`, and keep the layout a Server Component that renders it. If a client wrapper must surround server content (for example a theme provider), pass that content as `children`: Server Components passed this way are still rendered on the server.

</details>

## 2. The password hash in the page source

A Server Component loads the current user from the database and passes the whole record to a Client Component `<ProfileMenu user={user} />`, which shows only the name and avatar. A security review finds the user's email, role and password hash in the page's RSC payload (the serialized UI the server sends to the browser). How did that happen?

<details>
<summary>Answer</summary>

**Everything passed to a Client Component is sent to the browser.** Props crossing the boundary are serialized into the payload, whether the component renders them or not. Not showing a field doesn't make it secret.

Pass only the fields the component needs (`name`, `avatarUrl`), shaped by a small server-side function that builds a safe object. Guard modules that must never reach the client with the `server-only` package, so importing them from client code fails the build.

</details>

## 3. Saved, but the list is old

A Server Function (a `'use server'` function the client calls like a normal function) renames a project in the database. The call succeeds, but the project list on the same page, rendered by a Server Component, still shows the old name until the user reloads. Why?

<details>
<summary>Answer</summary>

Server Components decide **where code runs**, not **when its output is refreshed**. The list was rendered before the mutation, and possibly [cached](/architecture/caching/). Nothing automatically re-renders it or expires its data after the Server Function returns.

After the mutation, your code must tell the framework what changed. In Next.js, call `updateTag` inside the Server Action for the tags (labels that group cached entries) on the project data: the entries expire at once, and the framework sends the refreshed UI back in the same response, so the user sees their own change. `revalidateTag(tag, 'max')` would be the wrong choice here: it is stale-while-revalidate, so the refreshed page could still read the old entry ([Next.js caching](/tools/nextjs/caching/)). Other frameworks have their own APIs, but the idea is the same: expiring cached data and refreshing the UI don't happen by themselves. And because a Server Function is a public endpoint, it must also check that the caller may rename this project ([authorization](/security/auth/#authorization-checking-what-is-allowed)).

</details>

## 4. "window is not defined" in a client component

A Client Component (marked with `'use client'`) reads `window.innerWidth` during render to choose a layout. The page crashes on the server with `window is not defined`. "But it's a client component!" Why does it run on the server?

<details>
<summary>Answer</summary>

`'use client'` doesn't mean "browser only". Client Components are usually **rendered to HTML on the server** first (SSR, server-side rendering), so the first load is ready-made HTML, and then they hydrate in the browser. During that server render there is no `window`.

Read browser-only APIs **in effects** (which run only in the browser), and render a safe default first; or use CSS (media queries) instead of measuring in JavaScript. Make sure the first browser render matches the server HTML, or hydration will report a mismatch.

</details>

## 5. A slow page made of awaits

An order page is built from nested Server Components: the page awaits the user (200 ms), then renders `<Orders>`, which awaits the user's orders (300 ms), then renders `<Recommendations>`, which awaits a recommendation service (400 ms). The page takes almost a second before anything is sent. What can you do?

<details>
<summary>Answer</summary>

This is a **server waterfall**: each component starts its fetch only after its parent finished, so the times add up.

- Start **independent fetches in parallel**: if orders and recommendations need only the user ID, start both at once (or start them at the page level and pass the Promises down).
- Put the slow, optional parts inside **[Suspense](/tools/react/suspense/) boundaries** and read the Promises with `use` there, so the page shell and the orders [stream](/architecture/rendering/#streaming) first and recommendations arrive later.
- Cache what can be cached across requests, and use React's `cache()`, which deduplicates calls within one request only, so several components asking for the same data share one query.

</details>
