---
title: Real-time updates — check yourself
description: Scenario questions about polling, SSE, WebSockets, reconnects, fan-out and security.
quizFor: architecture/real-time
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Polling every second

An order-tracking page polls `GET /orders/42/status` every second. On a busy evening 50,000 tabs are open, many of them in the background, and the API is overloaded, although the status changes only a few times per order. What are your options?

<details>
<summary>Answer</summary>

The load is self-inflicted: 50,000 requests per second for data that rarely changes.

Cheap fixes first:

- **Poll less often** (every 10–30 seconds is fine for delivery status), and **pause in background tabs** with the Page Visibility API; refresh when the tab becomes visible again.
- Make each poll **cheaper**: return an `ETag` (a version tag of the response); the client sends it back in `If-None-Match`, and an unchanged status gets `304 Not Modified` without a body ([HTTP caching](/architecture/caching/#http-caching-the-shared-language)). This saves server work only if the server can check the version cheaply (for example a version number kept in a cache), not by running the same query as a full response. Fewer polls is what reduces the number of requests.

If updates must be near-instant, switch to **SSE** (Server-Sent Events: one long HTTP response that the server keeps writing events into). The server then pushes only real changes, but it holds an open stream per client and needs a pub/sub layer (a message bus that delivers each event to every server that subscribed, see [messaging](/architecture/background-jobs/#three-shapes-of-messaging)) to reach them.

</details>

## 2. WebSocket for notifications?

A team plans WebSockets for a notification bell and for showing export progress. Nothing is sent from the client except normal API calls. Would you choose differently?

<details>
<summary>Answer</summary>

**SSE** fits better. The data flows only from server to client, and SSE is plain HTTP: it works with cookie authentication and with most existing infrastructure, and the browser's `EventSource` reconnects on its own and sends `Last-Event-ID` (the last event it received) if events have IDs. Check the path: every proxy and [CDN](/web-platform/cdn/) in front of it must pass the stream through without buffering or caching it, with timeouts long enough or heartbeats (small regular messages) to keep it open. If the app authenticates with a bearer token in a header instead of a cookie, `EventSource` can't send it; read the stream with `fetch` instead.

A WebSocket is a bare two-way pipe: you would add reconnects, heartbeats and channels yourself or through a library, and it needs separate handling in proxies. It pays off for frequent two-way messages (chat with typing indicators, collaborative editing). One caveat for SSE: over HTTP/1.1 each stream keeps one of about six connections per origin busy, so serve it over HTTP/2 or HTTP/3. (An [origin](/security/browser-boundaries/#mental-model-origin-site-and-three-kinds-of-access) is the scheme, host and port of a site.)

</details>

## 3. Missing messages after a network switch

A chat app on a phone loses its connection while the user walks from Wi-Fi to mobile data. It reconnects, new messages arrive, but the messages sent during the gap never appear. Why, and how should reconnects work?

<details>
<summary>Answer</summary>

The client **reconnected but didn't resume**. Real-time messages sent while it was offline went nowhere.

Give each message an ID or sequence number. On reconnect, the client sends the last ID it saw, and the server replays what was missed from its history. If the gap is older than the history the server keeps, the client reloads the current state, without a gap between that snapshot and the stream. Store chat messages durably (they are the source of truth), treat the live connection only as a fast way to deliver them, and drop duplicates by ID.

</details>

## 4. Everyone reconnects at once

After each deploy, the real-time servers fall over for a few minutes. Metrics show all 100,000 clients reconnecting in the same second. What would you change?

<details>
<summary>Answer</summary>

A **reconnect storm**. When servers restart, every client notices at the same moment and reconnects immediately.

On the client: reconnect with **exponential backoff and jitter** (growing, random waits), so reconnects spread over seconds or minutes. On the server: during a deploy, **close connections gradually** (drain old servers over a period) instead of all at once. Also expect uneven load afterwards: connections stay where they were opened, so new servers stay quiet until clients reconnect.

</details>

## 5. Messages reach only some users

A chat service works perfectly on one server. After scaling to three servers behind a [load balancer](/architecture/scaling/#load-balancing), users say that some messages never arrive: it depends on who is "lucky". What is missing?

<details>
<summary>Answer</summary>

Each server holds only **its own clients' connections**. A message received by server A is sent to A's connections, but the recipients connected to B and C never hear about it.

Add a **pub/sub backbone** (Redis, NATS or a message broker, see [shapes of messaging](/architecture/background-jobs/#three-shapes-of-messaging)): every server publishes incoming messages to it and subscribes to the channels of its connected clients, then forwards what it receives. Or use a managed real-time service that does the fan-out (sending one event to many connections) for you.

</details>

## 6. Removed from the team, still reading

An admin removes a user from a private team channel. For the next few hours the user keeps receiving the channel's messages over the open WebSocket. What went wrong?

<details>
<summary>Answer</summary>

Permissions were checked **only when the connection was opened** and when the user subscribed to the channel. A connection can live for hours, and permissions can change during it.

Check permissions on every subscription and on every action, and **react to changes**: when a user is removed, the server unsubscribes them from the channel or closes the connection so it re-authenticates (see [authorization](/security/auth/#authorization-checking-what-is-allowed)); tokens that expire during a connection must be refreshed or the connection closed. Never send private data to a shared channel and filter it in the browser.

</details>
