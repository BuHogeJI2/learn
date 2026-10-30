---
title: How the browser runs code
description: The main thread, tasks and microtasks, when the browser gets a chance to paint, why async doesn't mean parallel, and how to find the work that blocks a page.
related:
  - web-platform/page-loading
  - observability/web-vitals
  - architecture/rendering
officialDocs:
  - title: MDN — The JavaScript execution model
    url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model
  - title: MDN — Using microtasks in JavaScript
    url: https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide
  - title: MDN — Using Web Workers
    url: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
  - title: MDN — Scheduler.yield()
    url: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
  - title: web.dev — Optimize long tasks
    url: https://web.dev/articles/optimize-long-tasks
  - title: Chrome DevTools — Analyze runtime performance
    url: https://developer.chrome.com/docs/devtools/performance
  - title: HTML Standard — Event loops
    url: https://html.spec.whatwg.org/multipage/webappapis.html#event-loops
---

## What problem it solves

[How a browser loads a page](/web-platform/page-loading/) ends with "JavaScript runs on the main thread, and while it runs, clicks wait". [Web Vitals](/observability/web-vitals/#inp-how-fast-the-page-reacts) then advises you to split long tasks, yield to the browser, or use a worker (a background thread). This page explains why these things work.

Without this model, the same bugs return: a page that freezes during a calculation, a spinner that never appears because the browser never gets a chance to draw it, and "but it's `async`!" about code that still blocks every click.

## Mental model: one worker, one queue of jobs

For each page, one thread does almost everything: runs your JavaScript, handles input events, calculates styles and layout, and paints. This is the **main thread**. It does one thing at a time.

The **event loop** is how it chooses what to do next:

```
        ┌─────────────────────────────────────────────────────┐
        │ 1. take one task from a queue                       │
        │    (click, timer, network response, script)         │
        │ 2. run it to the end  ◄── nothing else can happen   │
        │ 3. run all microtasks (promise callbacks)           │
        │ 4. maybe render: rAF → style → layout → paint       │
        └──────────────────────── repeat ─────────────────────┘
```

Three rules explain most of the behavior:

- **A task runs to completion.** Once a task starts, nothing can interrupt it: not a click, not a paint. A click during a 2-second task waits 2 seconds.
- **Rendering happens between tasks.** The browser can paint only when the current task and its microtasks are finished. It doesn't paint after every task: it aims to match the screen's refresh rate, usually 60 times per second, or about 16 ms per frame.
- **DOM changes aren't visible right away.** Your code updates the DOM at once, but the user sees the change only at the next paint. If one task shows a spinner, calculates and hides the spinner, the user never sees it.

## Tasks, microtasks and frames

| Kind | Comes from | Runs |
| --- | --- | --- |
| **Task** | Events, `setTimeout`, network callbacks, `postMessage`, the page's scripts | One per loop turn; rendering can happen between tasks |
| **Microtask** | `Promise.then`, code after `await`, `queueMicrotask` | All of them, right after the current task, before any rendering |
| **Animation frame** | `requestAnimationFrame` (rAF) | Just before the next paint |

The important difference: **the browser can't paint between microtasks**. If a microtask schedules another microtask, the chain continues until it ends, and a long chain blocks the page exactly like one long task. An `await` on an already-finished Promise therefore gives the browser no chance to paint.

`setTimeout(fn, 0)` queues a new task, so if the current code then returns, the browser can paint or handle input before `fn` runs. Code that continues after the call still blocks: the work to postpone must be inside `fn`, or after an `await` of a Promise that a timer resolves. It isn't really zero: nested timers are clamped to about 4 ms, and background tabs are throttled much harder.

## Async is not parallel

`async`, `await` and Promises are about **waiting**, not about doing work at the same time.

```
await fetch(url)        the network work happens outside the main thread;
                        the thread is free to do other things while waiting
await heavyCalculation()  the calculation still runs on the main thread;
                          marking it async moves nothing
```

- **Waiting for I/O** (network, disk, timers) doesn't block. The browser does it elsewhere, and your code continues after the result arrives, with other tasks running in between. That is why one thread can run a page with fifty parallel requests.
- **CPU work** (filtering, sorting, parsing, rendering a large component tree) does block, whatever the syntax around it. The main thread must do the calculation itself.

Asynchronous code can also interleave. While an `await` really waits, other tasks run, so state can change in the middle of your function. That is where [race conditions](/architecture/state/#typical-failures) in frontend code come from.

## Long tasks and what users feel

A **long task** is a task that holds the main thread for more than 50 ms. That number is a definition for diagnostics, not a budget: smooth animation leaves about 16 ms per frame. During a long task, input waits, animations driven by JavaScript stop, and nothing paints. The usual sources:

- running or parsing large JavaScript bundles;
- [hydration](/architecture/rendering/#hydration-the-cost-of-html-that-looks-ready) and large re-renders;
- third-party scripts;
- **forced layout**: reading a geometry value such as `offsetHeight` right after changing the DOM, which makes the browser calculate layout immediately. In a loop this is called **layout thrashing**.

Long tasks are a common cause of poor [INP](/observability/web-vitals/#inp-how-fast-the-page-reacts) (how fast the page responds to input), but they aren't what it measures: INP also includes your event handlers and the time to paint the next frame, and it can be poor with no single task over 50 ms.

CSS `transform` and `opacity` animations can usually run on the **compositor** (a separate thread that moves already-painted layers), so they stay smooth while the main thread is busy. Animations of `top` or `height` need the main thread.

## Options: what to do with heavy work

| Option | How it helps | Costs |
| --- | --- | --- |
| **Do less** | Ship less code, render less, cache results | Needs real work, but it is the only option that also saves battery and bytes |
| **Yield**: split the work and give the browser a turn | Input and paint can run between the pieces | The total takes a little longer; other tasks can run in between, so state may change |
| **Prioritize** in the framework | React's [transitions](/tools/react/suspense/#updates-transitions-keep-what-is-already-shown) let urgent updates interrupt rendering work | Only helps rendering, not your own synchronous code |
| **Web worker** | The work runs on another thread, and the main thread stays free | No DOM access; data is copied through `postMessage`; more setup |
| **Server** | The work never reaches the phone | A network round trip, and server cost |

**Yielding** means ending the current task and continuing in a new one. `await scheduler.yield()` does this and puts the continuation ahead of other work of the same priority, so urgent input can still go first. It works in Chrome and Firefox but not in Safari, so check first and fall back to awaiting a Promise that `setTimeout` resolves; a resolved Promise is not a fallback, because it doesn't yield. A small helper that yields every 50 ms or so through a long loop is usually enough.

**Web workers** run a separate event loop on a separate thread. They suit pure computation: parsing a big file, image processing, search over a large list, WebAssembly. They talk to the page by messages, and the data is copied (a **structured clone**), which itself takes time for large objects. An `ArrayBuffer` can be **transferred** without copying, and `SharedArrayBuffer` shares memory, but it requires [cross-origin isolation](/security/browser-boundaries/#other-boundaries-worth-knowing). Workers can't touch the DOM, so the main thread must still apply the result. A [service worker](/web-platform/offline-and-storage/#service-workers-a-proxy-in-the-browser) is a different thing: it handles network requests, not your computation.

## Reading a Performance trace

The Network tab shows what was loaded. The **Performance panel** in Chrome DevTools shows what the main thread did.

1. Turn on **CPU throttling** (4× or 6×), because your laptop is much faster than a typical phone.
2. Record while you do the slow thing: click the button, type in the field.
3. Look at the **Main** track. Each block is a task, and blocks inside it are the functions it called. Tasks over 50 ms are marked with a red corner.
4. Find the widest block, then go down to the function that takes the time.

| What you see | Likely cause | Direction of the fix |
| --- | --- | --- |
| One wide block of script after a click | A slow event handler or a large re-render | Show feedback first, split the work, render less |
| Purple "Layout" blocks repeating in a loop | Layout thrashing | Read first, then write; batch DOM changes |
| Long block at startup, right after the script downloads | Parsing and running a big bundle, hydration | Code splitting, less JavaScript, less hydration |
| Blocks from third-party domains | Tag managers, widgets | Load later, or remove them |
| Green "Paint" taking long | Huge or complex areas to repaint | Simplify the painted area |

For the field, the **Long Animation Frames API** reports slow frames from real users, with the scripts that caused them. It exists only in Chromium browsers, so treat it as an extra diagnostic. Its data feeds the same questions as [real-user monitoring](/observability/web-vitals/#lab-data-and-field-data) (measurements in users' browsers).

## Typical failures

- **A spinner that never shows**: it is added and removed in the same task as the heavy work, so no paint happens in between.
- **`async` on CPU work**, expecting it to run in the background.
- **A long chain of microtasks** that starves rendering.
- **`await` in a loop over thousands of items that never actually yields.**
- **Layout thrashing**: reading `offsetHeight` after every write in a loop.
- **Yielding without a guard**: while the work is paused, the user changes the input, and the old result overwrites the new one. Cancel outdated work.
- **Moving DOM-heavy work to a worker**: the rendering still happens on the main thread.
- **A worker that copies a huge object back and forth**, spending more time on copying than it saves.
- **Testing only on a fast laptop**, where nothing looks long.

## When this knowledge pays off

- A page feels frozen, or INP is poor while the network looks fine.
- Choosing between a worker, the server and splitting work for a heavy feature.
- Reviewing a third-party script or a large dependency.
- Understanding why a framework offers transitions, deferred values or lazy hydration.

## Landscape

- **Measuring:** the Chrome DevTools Performance panel, Long Tasks and Long Animation Frames APIs, the `web-vitals` library's attribution build, Lighthouse.
- **Scheduling:** `scheduler.yield()` and `scheduler.postTask()`, `requestIdleCallback`, `requestAnimationFrame`, React transitions.
- **Off the main thread:** Web Workers, including WebAssembly run inside a worker (WebAssembly on its own runs on the main thread); the Comlink library for friendlier worker messages; Partytown for moving third-party scripts to a worker.
