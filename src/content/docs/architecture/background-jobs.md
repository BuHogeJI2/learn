---
title: Background jobs and messaging
description: Moving work out of the request — job queues, pub/sub and event logs, delivery guarantees, retries and poison messages, ordering, scheduled jobs and durable workflows.
related:
  - architecture/reliability
  - data/consistency
  - delivery/deployment-models
  - architecture/application-boundaries
  - architecture/scaling
officialDocs:
  - title: Amazon SQS — Visibility timeout
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html
  - title: Amazon SQS — Dead-letter queues
    url: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html
  - title: RabbitMQ — Consumer acknowledgements and publisher confirms
    url: https://www.rabbitmq.com/docs/confirms
  - title: Apache Kafka — Introduction
    url: https://kafka.apache.org/intro
  - title: microservices.io — Transactional outbox
    url: https://microservices.io/patterns/data/transactional-outbox.html
  - title: Enterprise Integration Patterns
    url: https://www.enterpriseintegrationpatterns.com/
---

## What problem it solves

Some work doesn't belong inside a request:

- sending emails, resizing images, generating PDFs and exports;
- calling slow third-party APIs, updating a search index, delivering webhooks.

Doing it in the request makes the user wait, can hit the platform's time limits ([deployment models](/delivery/deployment-models/)), and fails the whole request when one side effect fails.

Other work isn't started by a request at all: nightly reports, cleanups, a reminder three days after sign-up. And services need to tell each other "something happened" without calling each other directly ([application boundaries](/architecture/application-boundaries/)).

## Mental model: a durable to-do list between producer and consumer

```
Request ──► API ──► save the order ──► enqueue "send-receipt" ──► respond to the user (fast)
                                              │
                                        ┌─────▼─────┐
                                        │   queue   │   durable: survives restarts
                                        └─────┬─────┘
                                              ▼
                               worker: take a job → do the work → acknowledge
                                        (failed? → it comes back later)
```

The **producer** (the code that adds work) and the **consumer** (the worker that does it) are now separated:

- **in time**: the worker can be down for a while, and the work waits;
- **in speed**: the queue absorbs spikes as a buffer, and workers process at their own pace ([scaling](/architecture/scaling/));
- **in deployment**: they scale and release separately.

The price: the user doesn't see the result immediately, failures happen later where nobody is watching, and ordering and duplicates become your problem.

## Three shapes of messaging

| Shape | Who gets a message | After processing | Typical use | Examples |
| --- | --- | --- | --- | --- |
| **Job queue** (work queue) | **One** of the workers (they compete for messages) | Removed | Tasks: send this email, resize this image | Amazon SQS, RabbitMQ queues, BullMQ, Sidekiq, Celery |
| **Pub/sub** (publish/subscribe) | **Every** subscriber gets its own copy | Depends on the product: some keep nothing for absent subscribers, others retain messages and allow replay | Events with several reactions: "order created" → email, analytics, warehouse | Amazon SNS, Google Cloud Pub/Sub, RabbitMQ exchanges, NATS |
| **Event log** (stream) | Each **consumer group** reads the whole log and remembers its position (**offset**); workers inside one group split the log's partitions | **Kept** for a retention period; can be read again | High-volume event streams, analytics pipelines, rebuilding state from history | Apache Kafka, Redpanda, Amazon Kinesis, Redis Streams |

The shapes combine. Each independent reaction (email, analytics) gets its own subscription or consumer group, and several workers inside it share that reaction's load. Adding a worker to a group **divides** the work; adding a new group **repeats** it. Durability, acknowledgements and replay depend on the product and its settings, not only on the shape.

Two kinds of messages:

- a **command** says "do this" and has one handler ("send-receipt");
- an **event** says "this happened", and anyone may react ("order-created"). Events keep the producer unaware of who listens, which is the point of using them between services.

## Delivery guarantees: at least once is the norm

- **At most once**: a message may be lost, but is never repeated.
- **At least once**: a message that the broker has stored is not lost (within its retention period), but may arrive twice. This is what most queues give you.
- **Exactly once**: some systems offer it for processing *inside* the system (Kafka transactions). For effects outside it (an email sent, a card charged) it isn't possible in general.

Two different confirmations are involved. The **broker confirms to the producer** that it has stored the message; a producer that doesn't wait for this can lose messages before they reach the queue. Later, the **worker acknowledges** (acks) the message after processing it.

Why duplicates happen: if a worker crashes after doing the work but before the ack, the message is delivered again. Queues track unfinished messages in different ways. In SQS-style queues, a taken message is hidden for a **visibility timeout** (a lease) and reappears if it isn't acknowledged in time, so a job that runs too long is done twice. In RabbitMQ, an unacknowledged message goes back to the queue when the worker's connection closes. With leases, choose a timeout that fits normal jobs and renew it while long ones run; a very long lease slows recovery after a real crash.

So the practical goal is **effectively once** = at-least-once delivery + an **idempotent consumer** ([idempotency](/architecture/reliability/#idempotency-making-again-safe)):

- record the processed message ID **in the same database transaction** as the work's local effect, with a unique constraint, so both are saved or neither is. External effects (an email, a payment) can't join that transaction; use the provider's idempotency key, or a pending/done record with reconciliation;
- or make the operation naturally idempotent: "set status to paid" can run twice safely, "add 10 to the balance" can't.

## When processing fails

- **Retry with backoff** (waiting longer before each new attempt; [retries](/architecture/reliability/#retries-bounded-spaced-and-safe)). Many queues can deliver a message again after a delay.
- **Poison messages.** A message that always fails (bad data, a bug) is retried forever, wastes workers and can block a queue that keeps order. After a set number of attempts, move it to a **dead-letter queue** (DLQ): a separate queue for messages that need a human. Inspect them, fix the cause, then replay them. In an ordered stream, moving one message aside lets later messages of the same key go first, so decide on purpose: pause that key until the problem is fixed, or let it continue and repair the state afterwards.
- **Transient or permanent?** A timeout is worth retrying; invalid data is not. Send permanent failures to the DLQ at once.
- **Monitor the queue** ([what to measure](/observability/logs-metrics-traces/#what-to-measure)): the backlog size, the **age of the oldest message** (the best signal that work is late), the processing rate, the failure rate and the size of the DLQ. Alert on the DLQ.

## Ordering

- Most queues **don't guarantee order**, especially with several workers and retries: message 2 can finish before message 1.
- When order matters (events of one order: created → paid → shipped), use a **partition key**. A **partition** is one ordered sub-stream, and all messages with the same key go to the same partition and are delivered in order (Kafka partitions, SQS FIFO message groups). Order holds **per key**, not globally, and only if both sides keep it: the producer must publish in the right order, and the consumer must not process messages of one key in parallel or acknowledge a later one before an earlier one is done.
- Strict global order for a stream means processing that stream one message at a time, which limits its throughput.
- Often it is easier to **tolerate disorder**. If each message carries the **full new state** with a version number, a consumer can safely ignore versions older than the one it has. That doesn't work for changes such as "add 5": skipping an older one loses work, so changes need ordering, buffering until the gap is filled, or reconciliation. A **state machine** (a record with a fixed set of states and allowed transitions between them) can reject an impossible transition, but the rejected message then needs a retry or a buffer.

## Getting messages out reliably

The [dual-write problem](/data/consistency/#across-services-no-shared-transaction): "save to the database, then publish a message" fails if the process crashes between the two steps. Two mirror-image mistakes:

- **publishing after the commit** without protection: the order exists, but the message is lost;
- **publishing before the commit**: the worker receives a job about a row that doesn't exist yet, or a change that is later rolled back.

The **transactional outbox** fixes both: write the message into an outbox table in the same transaction as the data, and let a separate process publish rows from that table. If the publisher crashes after sending a row but before marking it as sent, it sends it again, so consumers still deduplicate. **Change data capture** (CDC: reading the database's own change log) is another way to turn committed changes into messages.

## Scheduled and long-running work

- **Scheduled jobs** (cron) run at fixed times. With several instances, every instance runs the same cron, and the job runs several times. Use a scheduler service or a lock, make the job idempotent, and monitor that it actually ran.
- **Long, multi-step processes** ("create the account, provision resources, send a welcome email, wait three days, send a reminder") need to survive crashes and deploys. **Durable execution** engines record each completed step and, after a crash, continue from the last recorded one. A step that finished its external effect but crashed before reporting it will run again, so steps must still be idempotent. They are also a practical way to run [sagas](/data/consistency/#across-services-no-shared-transaction).
- **Work after the response in serverless functions.** A promise left running after the response may be frozen or killed with the instance. Use the platform's tool for this (such as `waitUntil`) for short tasks, and a queue for anything that must not be lost.

How the frontend sees it: the API answers `202 Accepted` with a job ID; the UI shows progress ("Your export is being prepared") and either polls a status endpoint or receives the result over a [real-time channel](/architecture/real-time/). Design those states as carefully as the happy path.

## Typical failures

- **Non-idempotent consumers**: duplicate emails, double charges.
- **A visibility timeout shorter than the job**, so two workers do the same job.
- **No dead-letter queue**: a poison message is retried forever.
- **A growing backlog nobody notices.** Watch the age of the oldest message.
- **Lost or phantom messages** from writing to the database and the queue separately.
- **Large payloads in messages.** Put the file in object storage (a storage service for files, such as S3) and send a reference.
- **Stale data in the message.** By the time the job runs, the data may have changed; read the current state when it matters.
- **Redis Pub/Sub used as a durable queue.** It drops messages when no subscriber is connected.
- **Cron running on every instance.**
- **Breaking changes to message formats.** Old messages with the old shape are still in the queue; version messages and keep consumers compatible ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost)).

## How to choose

Ask about each piece of work:

1. Must the user wait for the result?
2. What happens if it runs twice? Late? Never?
3. Does order matter, and for which key?
4. Does more than one consumer care about it?

Then:

- **One app, simple tasks:** a job queue library on the database or Redis you already have (a PostgreSQL-backed queue adds no new system), or your platform's queue.
- **Events with several independent reactions:** pub/sub.
- **High-volume streams, replay, many consumers reading at their own pace:** an event log such as Kafka.
- **Long business processes with waits and compensations:** a durable workflow engine.

Don't bring Kafka in to send a hundred emails a day.

## Landscape

- **Job queues:** BullMQ (Redis, Node.js), Sidekiq (Ruby), Celery (Python), pg-boss and Graphile Worker (PostgreSQL), Solid Queue (Rails), Hangfire (.NET); hosted: Amazon SQS, Google Cloud Tasks, Upstash QStash, Trigger.dev.
- **Brokers and pub/sub:** RabbitMQ, Amazon SNS and EventBridge, Google Cloud Pub/Sub, Azure Service Bus, NATS.
- **Event logs and streams:** Apache Kafka (also as Confluent Cloud and Amazon MSK), Redpanda, Amazon Kinesis, Redis Streams, Apache Pulsar.
- **Durable execution:** Temporal, Restate, Inngest, AWS Step Functions.
- **Outbox and CDC:** Debezium.
- **Standards:** AsyncAPI (describing message-based APIs), CloudEvents (a common envelope for events).
