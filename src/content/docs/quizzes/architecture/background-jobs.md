---
title: Background jobs and messaging — check yourself
description: Scenario questions about queues, duplicates, poison messages, ordering and scheduled work.
quizFor: architecture/background-jobs
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Sign-up fails because of email

The sign-up endpoint creates the user and then sends a welcome email through an email provider, inside the same request. When the provider is slow or down, sign-up takes 20 seconds or fails, and users leave. What would you change?

<details>
<summary>Answer</summary>

The email is a **side effect** that doesn't need to finish before the user continues. Move it to a **job queue** (a durable list of work to do later): save the user, enqueue "send-welcome-email", and answer at once. A worker (a process that takes jobs from the queue) sends the email and [retries with backoff](/architecture/reliability/#retries-bounded-spaced-and-safe) (growing waits) if the provider is down.

Enqueue reliably: if the queue is a separate system, a crash between "save the user" and "enqueue" loses the job, so write the job in the same database transaction: a [transactional outbox](/data/consistency/#across-services-no-shared-transaction) (a table, written together with the user, from which a separate process publishes the job), or a queue that lives in your database. The cost: the email may arrive a little later, and failures happen where nobody is watching, so monitor the queue.

</details>

## 2. Two receipts, sometimes

Customers occasionally receive the same receipt email twice. The worker sends the email and then acknowledges the message. Nobody published the message twice. How can this happen, and how do you fix it?

<details>
<summary>Answer</summary>

Most queues deliver **at least once**. If the worker sent the email but crashed, was redeployed or ran past the **visibility timeout** (the time a taken message stays hidden from other workers) before the acknowledgement, the message comes back and the email is sent again.

You can't remove duplicates at the delivery level, so make the consumer **idempotent** (processing the same message twice has the same effect as once). For an effect inside your own database, record the processed message ID in the same transaction as the work. Sending an email is an **external effect** that can't join that transaction: a crash after sending but before recording still sends twice, and recording first can lose the email. So pass a stable **idempotency key** (for example `receipt-order-42`) to the email provider, which then sends it only once within its deduplication window. If the provider has no such feature, use a pending/sent record and reconcile, and accept that a rare duplicate is still possible. For long jobs, choose a visibility timeout that fits them and renew it while they run. The goal is **effectively once**: at-least-once delivery plus a consumer that can safely see a message twice.

</details>

## 3. A queue stuck on one message

The export queue's backlog grows for hours. Workers are busy, but almost nothing finishes. Logs show the same message failing again and again with a parsing error. What is going on, and what should the setup include?

<details>
<summary>Answer</summary>

A **poison message**: data that will always fail. It is retried forever, wastes workers and, in a queue that keeps order, blocks everything behind it.

The setup needs:

- a limit on attempts, after which the message goes to a **dead-letter queue** (DLQ, a separate queue for messages that need a human);
- sending permanent errors (invalid data) to the DLQ at once, and retrying only transient ones (timeouts);
- alerts on the DLQ size and on the **age of the oldest message**, the best signal that work is late;
- a way to replay DLQ messages after the cause is fixed.

In a queue that keeps order, moving one message aside lets later messages of the same key go first. If those effects need strict order, pause that key until the problem is fixed; otherwise let it continue on purpose and repair the state afterwards.

</details>

## 4. The nightly report arrives three times

After the app was scaled from one instance to three, the finance team gets the nightly report three times. Why?

<details>
<summary>Answer</summary>

The cron schedule lives in the app, so **every instance** runs it. Three instances, three runs.

Options: use a **scheduler** outside the app (the platform's cron, a cloud scheduler) that triggers the job once, for example by putting one message on a queue; or take a **lock** in the database so only one instance runs it. Either way, make the job **idempotent** ("report for 2026-10-29 already sent" → skip), because schedulers can also fire twice, and monitor that it ran at all.

</details>

## 5. "Shipped" before "paid"

A warehouse service consumes order events: `created`, `paid`, `shipped`. Sometimes it receives `shipped` before `paid` and rejects the order as invalid. Several workers consume the queue in parallel. How can you fix this?

<details>
<summary>Answer</summary>

With several workers and retries, most queues **don't keep order**: a later message can finish before an earlier one.

Options:

- **Partition by order ID** (a partition is one ordered sub-stream: Kafka partitions, SQS FIFO message groups): all events of one order go to one partition and are delivered in the order they were written. Order holds **per key**, which is what you need here, and other orders still run in parallel. It works only if both sides keep it: the producer publishes `created`, `paid`, `shipped` in that order, and the consumer finishes each event of an order before taking the next (no parallel processing per key, no later event acknowledged while an earlier one is retried).
- **Tolerate disorder**, but only for a consumer that keeps a copy of the latest state (a read model): if each event carries the **full new state** with a version number, it ignores events with a lower version than the one it has. This doesn't fit a warehouse that must *do* something for each step, such as reserve on `paid`: skipping an event skips its work.
- A **state machine** that, instead of rejecting an impossible transition, retries or buffers the message until the missing one arrives.

Strict global order would mean one message at a time for the whole stream, which limits throughput; avoid it.

</details>

## 6. A two-minute export

Users can export their data as CSV. The export takes about two minutes. The API runs on [serverless functions](/delivery/deployment-models/#deployment-models) (code the platform starts per request) with a 60-second limit. How do you design it, including the UI?

<details>
<summary>Answer</summary>

Don't do it in the request. The API answers **`202 Accepted`** with a job ID and enqueues the export. A worker (not limited to 60 seconds) builds the file, puts it in object storage (a storage service for files, such as S3) and records the status.

The UI shows "Your export is being prepared", then either polls a status endpoint or gets an update over a [real-time channel](/architecture/real-time/), and finally a download link (or an email with one). Design the states: queued, in progress, failed with a retry button, done. Don't start the work in a promise after the response: the platform may freeze or kill the function, and the export is lost.

</details>
