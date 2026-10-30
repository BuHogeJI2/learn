---
title: Offline and browser storage
description: Where a web app can keep data on the device, how long it stays there, how service workers intercept requests, and what queued offline writes really cost.
related:
  - architecture/state
  - architecture/caching
  - web-platform/site-files
officialDocs:
  - title: MDN — Storage quotas and eviction criteria
    url: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
  - title: MDN — IndexedDB API
    url: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
  - title: MDN — Cache
    url: https://developer.mozilla.org/en-US/docs/Web/API/Cache
  - title: MDN — Origin private file system
    url: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
  - title: MDN — Using Service Workers
    url: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
  - title: web.dev — The service worker lifecycle
    url: https://web.dev/articles/service-worker-lifecycle
  - title: web.dev — Storage for the web
    url: https://web.dev/articles/storage-for-the-web
---

## What problem it solves

Some data should stay on the device: an unsent draft, a theme choice, a large dataset that shouldn't be downloaded twice, the app shell (the basic UI and files needed to open an app) of a tool people open on a train. And a network is not always there. By default, a web app with no connection shows the browser's error page.

The browser offers several stores and one programmable network layer. The hard part isn't the API. It is deciding **who owns the data**, **how long it may live**, and **what happens when device and server disagree**.

Browser data is a [copy on someone else's disk](/architecture/state/#mental-model-the-owner-decides): the user can delete it, the browser can evict it, and scripts on your [origin](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) (scheme + host + port) can read most of it. Treat it as a cache unless you have a reason not to.

## Mental model: stores per origin, and a proxy in front

```
page ──┬── localStorage        small strings, synchronous
       ├── IndexedDB           structured data, queries, large
       ├── Cache API           request → response pairs
       ├── OPFS                files
       │
       └── fetch ──► service worker ──► cache or network
                     (a proxy your code controls)
```

All these stores are per origin, and third-party iframes get a separate, partitioned copy. IndexedDB, the Cache API and OPFS share one quota and are deleted together; `localStorage` and `sessionStorage` have their own small limit, and cookies have their own rules.

## Storage options

| Store | Holds | API | Good for | Limits |
| --- | --- | --- | --- | --- |
| **Cookies** | Small strings, sent to the server | Header, `document.cookie` | Session identity ([auth](/security/auth/#where-the-browser-keeps-credentials)) | About 4 KB each; sent with every matching request |
| **`localStorage`** | Strings | Synchronous | Small preferences | About 5 MiB per origin; blocks the main thread |
| **`sessionStorage`** | Strings | Synchronous | State of one tab, such as a multi-step form | Same; ends with the tab |
| **IndexedDB** | Objects, files, with indexes and transactions | Asynchronous, events (usually through a library) | Offline data, large client caches | Shares the origin quota |
| **Cache API** | HTTP request and response pairs | Asynchronous, Promises | App shell, files, API responses, used from a service worker | Shares the origin quota |
| **OPFS** (origin private file system) | Files, invisible to the user | Asynchronous; fast synchronous access from a worker | SQLite in the browser, editors, large files | Shares the origin quota |

**`localStorage` is synchronous**: reading it blocks the [main thread](/web-platform/browser-execution/#mental-model-one-worker-one-queue-of-jobs). Keep it small. Never keep [tokens or other secrets](/security/auth/#where-the-browser-keeps-credentials) in a store that JavaScript can read: any script on the origin can copy them. An `HttpOnly` session cookie is different, because page scripts can't read it.

## How long data lives

By default, browser storage is **best-effort**: it stays while there is space, and the browser may delete it.

- **Quota.** For IndexedDB, the Cache API and OPFS, each origin gets a share of the disk, which differs by browser. Writes over the quota fail with `QuotaExceededError`, so wrap them in `try/catch`. `navigator.storage.estimate()` gives an approximate usage and quota.
- **Eviction under pressure.** When the device runs out of space, the browser deletes the data of the least recently used origins. All of an origin's data goes at once, so your app must handle "everything is gone".
- **Safari's seven-day rule.** With cross-site tracking prevention on, an origin with no user interaction in the last seven days of browser use loses the data its scripts created. It is not a lifetime for every record, and Home Screen web apps are exempt from this rule, though not from other causes of data loss.
- **Persistent storage.** `navigator.storage.persist()` asks the browser to keep the data until the user removes it. It is a request whose Promise resolves to `true` or `false`: Firefox prompts the user; Chromium and Safari decide from how the user has interacted with the site.
- **The user** can clear site data at any time, and private windows discard it.

So design for loss: anything stored only on the device can vanish. Sync important data to a server, and treat a missing local copy as a normal state.

## Service workers: a proxy in the browser

A **service worker** is a script the browser runs in the background, separately from any page. Once it controls a page, every `fetch` from that page goes through it, and it decides what to answer. It works only over [HTTPS](/web-platform/http/#https-what-tls-adds) (or `localhost`), has no DOM, and the browser stops it when idle, so it can't keep state in memory.

**Its lifecycle protects running pages from mixed versions:**

```
register ──► install ──► waiting ──► activate ──► controls pages
             (pre-cache   (old worker  (clean old
              files)       still runs   caches)
                           open tabs)
```

- **A new version waits** until every tab controlled by the old one is closed. A reload isn't enough when another tab is open.
- `skipWaiting()` activates the new worker at once, and `clients.claim()` takes over open pages. Both are useful, and both create **[version skew](/delivery/deployment-models/#releasing-from-commit-to-users)**: a page loaded with old JavaScript now talks to a new worker and its new cached files.
- **The browser checks for a new worker** script on navigation, and by default it skips the HTTP cache for the main script, but not for the scripts it imports. Keep those versioned, or a fix may not reach users.

**A service worker is a programmable [cache](/architecture/caching/#freshness-strategies).** The strategy is chosen per kind of request:

| Strategy | Behavior | Good for |
| --- | --- | --- |
| **Cache first** | Answer from the cache, go to the network only on a miss | Files with a content hash in the name |
| **Network first** | Try the network, fall back to the cache when offline | HTML, API data that should be fresh |
| **Stale-while-revalidate** | Answer from the cache, refresh it in the background | Avatars, data that may be slightly old |
| **Network only** | Skip the worker's cache | Payments, anything personal or sensitive; these also need the right [HTTP cache headers](/architecture/caching/#http-caching-the-shared-language), because the HTTP cache is separate |

Unlike the HTTP cache, this cache has no expiry of its own: entries stay until your code removes them. A forgotten cache-first rule on HTML can **pin users to an old version of the app**, and they can't escape it with a normal reload, because the worker keeps answering.

## Offline writes: the expensive part

Reading offline is mostly a caching problem. **Writing offline turns a client into a small distributed system.**

A typical design: save the change locally, show it at once, and send it later from an **outbox** (a local queue of unsent changes). Write the change and its outbox record in the same IndexedDB transaction, so that a crash can't leave a local edit that will never be sent.

```
user action ──► local store + outbox ──► UI updates at once
                       │ when online
                       ▼
                    server ──► accepted / rejected / conflict
```

The questions this raises are the ones from [reliability](/architecture/reliability/) and [consistency](/data/consistency/), now on a phone:

- **Duplicates.** The request may succeed and the response may be lost, so the client retries. Give each change an [idempotency key](/architecture/reliability/#idempotency-making-again-safe), created once and kept with the queued change.
- **Conflicts.** Two devices changed the same record while offline. Choose: last write wins (simple, and it silently loses data), a [version check](/architecture/state/#concurrent-changes) that shows the conflict to the user, or merging with CRDTs (data types that merge automatically).
- **Rejection.** The server refuses a change the user saw as done hours ago: the item is sold out, the permission is gone. The UI needs a place to show this.
- **Order.** Changes that depend on each other must be sent in order; one failed change can block those behind it.
- **Permissions and identity.** The user may be logged out or removed while offline, and the local data of the previous user must not remain for the next one. The same goes for the queue: tie each queued change to the user and tenant (the customer organization) that made it, or user A's edits get sent with user B's credentials. The server still checks permissions on every change.
- **Schema.** Local data outlives app versions. IndexedDB has its own [migrations](/data/schema-evolution/), which run on every user's device.
- **Sending.** The **Background Sync** API can send the outbox after the page is closed, but it works only in Chromium browsers. Always also send when the app is open and the connection returns.

"Stored locally" is not "accepted by the server", so show pending and failed changes in the UI. Use `navigator.onLine` carefully: `true` means there is a network interface, not that your server is reachable. Treat real request failures as the signal.

## Typical failures

- **Secrets or tokens in `localStorage`.** One [XSS](/security/web-attacks/#xss-data-that-becomes-code) bug exposes them.
- **Large JSON in `localStorage`**, parsed on the main thread at every start.
- **No handling for `QuotaExceededError`** or for data that disappeared.
- **Personal data left on a shared device** after logout.
- **A service worker that caches HTML cache-first**, so users stay on an old version after a deploy.
- **No way to remove a broken service worker.** Keep a plan: a new worker that unregisters itself, served at the same URL.
- **Caching authenticated responses** in the Cache API, where the next user of the device can get them.
- **Unbounded caches** that grow until the browser evicts everything.
- **Opaque responses** from other origins in the Cache API: the app can't read their status, so an error can be cached, and browsers count them as much larger than they are.
- **Optimistic offline writes with no plan for rejection**, so the UI claims something that never happened.
- **Assuming a [web app manifest](/web-platform/site-files/#install-and-app-identity-the-web-app-manifest) gives offline support.** It doesn't; a service worker does.

## When to use which

- **A preference or a small flag:** `localStorage`, or a cookie if the server must see it during rendering.
- **An unsent draft:** IndexedDB (or `localStorage` for short text), and sync it to the server.
- **Faster repeat visits:** the HTTP cache with [good headers](/architecture/caching/#http-caching-the-shared-language) first. It needs no code.
- **An app that must open with no network:** a service worker with a pre-cached app shell.
- **Offline reading:** the app shell plus a cached data set.
- **Offline editing with several devices or users:** a sync engine or a local-first library (the local copy is the working source, and changes sync later). Writing this yourself is a project of its own.
- **Most content sites and dashboards:** you need none of this. A service worker adds a new way to break the site, so have a real reason.

## Landscape

- **IndexedDB wrappers:** idb, Dexie.
- **Service worker tooling:** Workbox, Serwist.
- **Databases in the browser:** the official SQLite WebAssembly build on OPFS, wa-sqlite; PGlite for PostgreSQL.
- **Sync engines and local-first:** Replicache and Zero, ElectricSQL, PowerSync, Yjs, Automerge.
- **Inspecting:** the DevTools Application panel shows every store, the service worker and its state, and it can simulate offline and clear site data.
