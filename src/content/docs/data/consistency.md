---
title: Data consistency and transactions
description: What goes wrong when many requests read and write the same data, and the guarantees — transactions, isolation, consistency models — that keep it correct.
related:
  - data/database-types
  - architecture/state
  - architecture/caching
officialDocs:
  - title: PostgreSQL — Transaction isolation
    url: https://www.postgresql.org/docs/current/transaction-iso.html
  - title: Jepsen — Consistency models
    url: https://jepsen.io/consistency
  - title: microservices.io — Saga pattern
    url: https://microservices.io/patterns/data/saga.html
  - title: microservices.io — Transactional outbox
    url: https://microservices.io/patterns/data/transactional-outbox.html
---

## What problem it solves

Many users and servers touch the same data at the same time. Operations fail halfway. Data is copied to replicas, caches and search indexes. Without guarantees, money disappears, two people book the last seat, and a user saves a change and then doesn't see it.

The frontend sees the symptoms: two orders after a double click, old data right after saving, a counter that is slightly off, a "conflict" nobody handled.

## Mental model: three sources of trouble

| Trouble | Example | Guarantee that answers it |
| --- | --- | --- |
| **Partial failure** | Money left one account, the server crashed before it reached the other | **Atomicity**: all steps or none |
| **Concurrency** | Two requests read "1 seat left" and both book it | **Isolation**: how much parallel operations can see of each other |
| **Copies** | A replica or a cache still has the old value | **Consistency models**: what a read may return |

The first two are solved inside one database with **transactions**. The third appears as soon as data lives in more than one place.

## Transactions and ACID

A **transaction** groups several reads and writes into one unit. Databases describe their transaction guarantees as **ACID**:

- **Atomicity**: all changes are applied, or none. A transfer debits and credits together.
- **Consistency**: your rules (constraints such as "balance ≥ 0", unique email, foreign keys) hold after each transaction. This "consistency" means *your rules are kept*; it is a different meaning from "consistency" in distributed systems below.
- **Isolation**: parallel transactions don't see each other's unfinished work, to a degree set by the **isolation level**.
- **Durability**: once committed, the change survives a crash.

A transaction lives **inside one database**. A flow that writes to your database, charges a card through Stripe and sends an email has no shared transaction; see [across services](#across-services-no-shared-transaction).

## Concurrent writes and isolation

The classic problems:

- **Lost update.** Two requests read `stock = 5`, both write `stock = 4`. One sale is lost.
- **Write skew.** Two doctors on call each check "is someone else on call?", see "yes", and both go off call. Each read was correct; the combined result breaks the rule.
- **Non-repeatable read.** The same query inside one operation returns different results, because someone committed in between.

Isolation levels (names from the SQL standard; the details differ between databases):

| Level | What a transaction sees | Typical default in | Still possible |
| --- | --- | --- | --- |
| **Read committed** | Only committed data, but each statement may see newer data | PostgreSQL | Lost updates in read-then-write code; write skew |
| **Repeatable read / snapshot** | One snapshot for the whole transaction | MySQL (InnoDB) | Write skew; in some databases also lost updates |
| **Serializable** | As if transactions ran one after another | — | Nothing of the above, but the database may abort a transaction, and the code must retry it |

In practice, most apps stay on the default level and protect the few critical places explicitly:

- **Atomic updates**: let the database do the math in one statement: `UPDATE products SET stock = stock - 1 WHERE id = 3 AND stock > 0`. If no row changed, the item is sold out.
- **Constraints**: a unique index makes two accounts with the same email impossible, whatever the timing. Letting the database enforce a rule is the most reliable tool.
- **Pessimistic locking**: lock the row while you work on it (`SELECT … FOR UPDATE`). Safe, but other requests wait, and careless order of locks causes deadlocks.
- **Optimistic locking**: store a version number, and in one update change the data and raise the version: `UPDATE documents SET title = 'New', version = 8 WHERE id = 3 AND version = 7`. If no row changed, someone else got there first: retry or show a conflict. This is the same idea as `ETag` with `If-Match` over HTTP ([concurrent changes](/architecture/state/#concurrent-changes)).
- **Serializable** for the small part of the system where invariants span several rows (bookings, balances), with automatic retries.

## Copies and consistency models

As soon as data is copied, a read can return an older version:

```
write ──► Primary ──(replication lag: usually ms to seconds, sometimes more)──► Replica ◄── read
                                                     a read here may return the old value
```

The two ends of the scale:

- **Strong consistency** (linearizability): every read sees the latest committed write, as if there were one copy. Reading from the current primary avoids replica lag, but it is a full guarantee only if the read isn't served from an older snapshot and a failover never loses writes that were already confirmed.
- **Eventual consistency**: if writes stop, all copies become the same, eventually. There is no promise about when. Caches, search indexes, CDNs and [DNS](/web-platform/dns/#changing-dns-safely) are eventually consistent.

Between them sit **session guarantees**: promises about what one user sees. They are separate, and a system can give one without the other:

- **Read-your-own-writes**: a user always sees their own changes, even if others see them a bit later. Reliable ways: keep that user's reads on the primary, or read from a replica only after checking that it has applied the user's write (some databases return a position or version token for this). Sending reads to the primary for a fixed time after a write is a common shortcut, but it fails when the lag is longer than that time. The UI side is in [Client and server state](/architecture/state/#concurrent-changes).
- **Monotonic reads**: a user never sees time go backwards. Without it, two reads that hit replicas with different lag can show a new value, then an old one. A common fix is to keep each user on the same replica.

**CAP**, briefly. When the network splits copies of the data from each other (a partition), a system must choose: refuse some requests to stay consistent, or keep answering and risk stale or conflicting data. That is all CAP says, and it applies only during a partition. In normal operation the everyday trade-off is **latency versus consistency**: keeping copies in agreement needs coordination (waiting for other copies, or going to the one place that owns the data), which makes operations slower. Don't use CAP to sort databases into boxes; check which guarantee each operation gets.

## Across services: no shared transaction

An order flow often touches your database, a payment provider, a warehouse service and an email service. There is no transaction across them. Two-phase commit (a protocol that locks all participants until everyone agrees) exists but is rare on the web. Instead:

- **Make every step idempotent and retryable**, with an [idempotency key](/architecture/api-styles/#error-boundaries), so a retry never charges twice.
- **Sagas**: a sequence of local transactions, each with a **compensating action** that undoes it in business terms. If the stock reservation fails after the payment, the compensation is a refund. Intermediate states ("payment received, stock pending") are visible and must be designed for.
- **The dual-write problem**: "save the order, then publish an 'order created' message" fails if the process crashes between the two steps; the order exists, but nobody hears about it. The **transactional outbox** pattern writes the message into the same database transaction as the order, and a separate process publishes it later ([background jobs](/architecture/background-jobs/#getting-messages-out-reliably)).
- **Show intermediate states in the UI**: "Processing", "Pending confirmation". Pretending a multi-step flow is instant leads to confusing errors later.

## Typical failures

- **Read-modify-write in application code** without a lock or an atomic update: counters, stock, balances.
- **Check-then-insert** without a unique constraint: duplicate accounts, double bookings.
- **A double submit creates two orders.** Disabling the button helps the user but guarantees nothing. An idempotency key does, if the client creates **one key per intended operation** (for example when the checkout form opens), reuses it for every click and retry, and the server rejects repeats of a key it has already seen.
- **Reading from a replica right after a write**: "my change disappeared".
- **Long transactions** that hold locks while calling other services over HTTP.
- **Ignoring serialization errors and deadlocks** instead of retrying them.
- **Side effects inside a transaction**: an email is sent, then the transaction rolls back.
- **Ordering events by timestamps from different machines.** Their clocks differ (clock skew), so "later" may be wrong.
- **Assuming the cache or search index is current.**

## How to choose

Start with the question: **what does a wrong answer cost, and what does a slow or refused answer cost?**

- **Default:** a relational database with transactions at its default level, plus constraints, atomic updates for counters and stock, and optimistic versions for records users edit.
- **Money, inventory, bookings:** serializable transactions or explicit locks for the critical part, and idempotency keys on the API.
- **Feeds, likes, view counts, search results:** eventual consistency is fine; approximate numbers are acceptable.
- **Right after the user's own change:** read-your-own-writes.
- **Flows across services:** sagas, idempotency and an outbox, with intermediate states shown in the UI.

## Landscape

- **Single-node transactional databases:** PostgreSQL, MySQL, SQLite, SQL Server.
- **Distributed SQL with strong guarantees:** Google Spanner, CockroachDB, YugabyteDB, TiDB.
- **Tunable or eventual:** Cassandra (consistency chosen per query), DynamoDB (eventually consistent reads by default, strong reads and transactions as options), MongoDB (read and write concerns, multi-document transactions).
- **Workflow engines for sagas and durable multi-step flows:** Temporal, AWS Step Functions, Inngest, Restate.
- **Change data capture** (streaming database changes to other systems, often used for outboxes): Debezium.
- **Testing guarantees:** Jepsen's published analyses of real databases.
