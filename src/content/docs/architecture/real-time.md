---
title: Real-time delivery
description: How the server sends fresh data to the browser — polling, long polling, Server-Sent Events and WebSockets — and how to handle reconnects, missed updates and fan-out to many connections.
related:
  - web-platform/http
  - architecture/background-jobs
  - architecture/state
  - architecture/scaling
  - delivery/deployment-models
officialDocs:
  - title: MDN — Using server-sent events
    url: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
  - title: MDN — The WebSocket API
    url: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
  - title: HTML Standard — Server-sent events
    url: https://html.spec.whatwg.org/multipage/server-sent-events.html
  - title: RFC 6455 — The WebSocket Protocol
    url: https://www.rfc-editor.org/rfc/rfc6455
  - title: MDN — WebTransport API
    url: https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API
---

## What problem it solves

HTTP is request and response: the server can only answer when the client asks ([HTTP](/web-platform/http/)). But many features need the server to say something new on its own:

- chat messages, notifications, live scores and prices;
- "your export is ready" after a [background job](/architecture/background-jobs/);
- dashboards, collaborative editing, multiplayer;
- AI answers streamed word by word.

The questions are: how fresh must the data be, which side talks, and what does it cost to keep it fresh for every open tab?

Don't confuse this with background work. Real-time delivery **notifies clients**; work that must not be lost belongs in queues.

## Mental model: who starts, and how long the connection lives

```
Polling        client: "anything new?"   server: "no."            …again every N seconds
Long polling   client: "anything new?"   server waits … "yes, here it is"  → client asks again
SSE            client opens one HTTP response; the server keeps writing events into it
WebSocket      one upgraded connection; both sides send messages at any time
```

These are separate trade-offs, not a ladder. Polling is the only option with a built-in delay; the other three deliver almost at once. They differ in **direction** (who can send), in the **request overhead** of each update, and in how many long-lived **streams** the server keeps open. A stream isn't always a separate network connection: over HTTP/2 and HTTP/3 many streams share one connection, although servers still limit how many streams one connection may carry.

## Options

| | Polling | Long polling | SSE (Server-Sent Events) | WebSocket |
| --- | --- | --- | --- | --- |
| **Direction** | Client pulls | Server to client, one answer per request | Server to client | Both ways |
| **Delay of an update** | Up to the interval | Almost none | Almost none | Almost none |
| **Connection** | A new request each time | Held open until an event or a timeout | One long HTTP response | One long-lived connection |
| **Protocol** | Plain HTTP | Plain HTTP | Plain HTTP, `text/event-stream` | Its own protocol after an HTTP "upgrade" (`wss://`, WebSocket over TLS) |
| **Reconnect and missed events** | Each poll gets the current state; getting *every* event needs a cursor | Your code | `EventSource` reconnects and sends `Last-Event-ID` if events have IDs; replaying what was missed is the server's job | Your code |
| **Works with existing HTTP setup** (cookies, proxies, [CDNs](/web-platform/cdn/)) | Yes | Mostly | Mostly; proxies that buffer responses break it | Needs separate handling; some proxies and firewalls block it |
| **Server cost** | Many requests | Many held requests | One open stream per client | One open connection per client |
| **Good for** | Rare updates, few users, simplicity | A fallback when nothing else works | Notifications, feeds, progress, streaming AI answers | Chat, collaboration, games, frequent two-way messages |

Details that matter:

- **SSE in the browser.** The built-in `EventSource` only makes `GET` requests and can't set custom headers, so authentication goes through cookies. Many apps read the same event-stream format with `fetch` instead, which allows `POST` and headers; that is how most AI chat interfaces stream answers. With `fetch`, reconnecting and sending the last event ID are your code's job.
- **SSE and HTTP/1.1.** Each SSE stream keeps a connection busy, and browsers allow about six connections per origin over HTTP/1.1. A few open tabs can block all other requests. Over [HTTP/2 and HTTP/3](/web-platform/http/#http-versions-same-meaning-different-transport) streams share one connection, so this limit disappears (servers still cap the number of streams per connection).
- **WebSocket is a bare pipe.** The protocol has ping and pong frames, but the browser API doesn't let your code send them, and there is no built-in reconnect, heartbeat schedule, message acknowledgements or channels (named topics a client subscribes to). Libraries such as Socket.IO add them, with their own protocol on top.
- **Newer and different tools:** WebTransport (over HTTP/3, several streams and unreliable messages, for games and media), WebRTC (direct peer-to-peer audio, video and data), and Web Push (notifications when the page isn't open at all).

## The connection will drop

Mobile networks switch, laptops sleep, and [deploys](/delivery/deployment-models/#releasing-from-commit-to-users) restart servers. Design for reconnects from the start:

- **Reconnect with backoff and jitter** (growing, randomized waits between attempts; [retries](/architecture/reliability/#retries-bounded-spaced-and-safe)). Otherwise, when a server restarts, all its clients reconnect in the same second.
- **Resume, don't just reconnect.** Give each event an ID or sequence number. On reconnect, the client sends the last ID it saw, and the server replays what was missed from its history. If that ID is older than the history the server keeps, the client reloads the current state. The reload must not leave a gap: the snapshot should come with the position of the last event it includes, so the stream continues from exactly there (or subscribe first, buffer the events, load the snapshot, then apply the buffered events that are newer).
- **Treat messages as hints.** A simple design: an "order 42 changed" message makes the client invalidate and refetch that data ([reading server state](/architecture/state/#reading)), and the server stays the source of truth. It heals itself only if something else also triggers refetches, because a lost *last* message is never followed by another one: refetch on reconnect and on window focus, and periodically where it matters.
- **Heartbeats.** Send a small message every few tens of seconds, so proxies don't close the connection as idle. To detect a dead connection, expect an answer or some activity within a deadline: sending alone can succeed into a buffer even when the other side is gone.
- **Duplicates and disorder** can appear around reconnects. Event IDs let the client drop duplicates. A version number lets it ignore an older **full state** of the same record; but separate messages and edits (two chat messages, two changes) are each needed, so missing ones must be fetched or replayed, not skipped.

## Fan-out: one event, many connections

Each server holds the connections of its own clients. An event that happens on server A must reach users connected to servers B and C:

```
event ──► pub/sub (Redis, NATS, a broker) ──┬─► server A ──► its open connections
                                            ├─► server B ──► its open connections
                                            └─► server C ──► its open connections
```

- Servers need a **pub/sub backbone** between them ([shapes of messaging](/architecture/background-jobs/#three-shapes-of-messaging)).
- **Every open connection costs memory** and a network socket on the server, even when nothing is sent.
- **Slow clients.** A tab on a bad network receives messages slower than they are produced, and the server's buffer for it grows. Limit the buffer per client, merge updates that replace each other, and disconnect clients that fall too far behind so they resync.
- **[Load balancing](/architecture/scaling/#load-balancing) is uneven**: connections stay on the server they started on. After scaling up, new servers stay quiet until clients reconnect; during a deploy, old servers must close connections gradually so clients move over without a storm.
- **Serverless functions** usually can't hold connections ([what survives a restart](/delivery/deployment-models/#state-what-survives-a-restart)). Use long-running servers, a managed real-time service, or a platform built for connections.
- **Security lives as long as the connection.** WebSocket handshakes aren't protected by CORS, and a cookie-based handshake can be started from another site, so check the `Origin` header against your trusted origins ([browser boundaries](/security/browser-boundaries/)). This adds to authentication, it doesn't replace it: non-browser clients can fake the header. Check permissions on connect, on every channel subscription and for every action a client sends ([authorization](/security/auth/#authorization-checking-what-is-allowed)). Tokens and permissions can change during a connection that lasts hours; check again or close the connection. Never send private data to a shared channel and filter it in the browser.

## Typical failures

- **Every tab polls every second.** A self-inflicted flood of requests. Poll less often, pause in background tabs (the Page Visibility API), and make polls cheap with `ETag` and `304` ([HTTP caching](/architecture/caching/#http-caching-the-shared-language)).
- **Assuming the connection stays open.** Without resume, the UI silently shows old data after a network switch.
- **Reconnect storms** after a deploy or an outage.
- **Proxies and CDNs that buffer** the SSE response or close idle connections.
- **Many SSE streams over HTTP/1.1** that use up the connection limit.
- **Checking permissions only at connect time.**
- **Broadcasting everything and filtering on the client**, which leaks data.
- **WebSockets for data that changes every few minutes**, where polling or SSE would be simpler.
- **Treating real-time messages as durable.** A user who is offline misses them. Anything that must reach the user goes into a stored inbox, the source of truth; a push notification can point to it, but push delivery itself isn't guaranteed.

## How to choose

- **Updates every few minutes, or a little staleness is fine:** polling, or refetching when the window gets focus.
- **The server streams to the client** (notifications, progress, feeds, AI answers): SSE.
- **Frequent two-way messages with low delay** (chat with typing indicators, collaborative editing, multiplayer): WebSocket.
- **You don't want to run connection servers:** a managed real-time service.
- **The user must get it even with the page closed:** a stored inbox, plus Web Push or mobile push as a best-effort way to tell them.
- **Collaborative editing:** WebSocket plus a CRDT library that merges concurrent edits ([concurrent changes](/architecture/state/#concurrent-changes)).

## Landscape

- **Browser APIs:** `EventSource`, `WebSocket`, `fetch` with streamed responses, WebTransport, Web Push, the Page Visibility API.
- **Servers and libraries:** Socket.IO, `ws` and uWebSockets.js (Node.js), Phoenix Channels (Elixir), SignalR (.NET), Centrifugo; GraphQL subscriptions.
- **Managed services:** Pusher, Ably, PubNub, Supabase Realtime, Firebase listeners, AWS AppSync, Cloudflare Durable Objects; Liveblocks and PartyKit for collaboration.
- **Sync engines that hide the transport:** Zero, Replicache, ElectricSQL, Convex.
- **Collaborative data:** Yjs, Automerge.
