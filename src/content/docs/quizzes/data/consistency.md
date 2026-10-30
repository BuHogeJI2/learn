---
title: Data consistency and transactions — check yourself
description: Scenario questions about concurrent writes, replicas, sagas and choosing guarantees.
quizFor: data/consistency
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. The last seat, sold twice

A booking service runs: read the free seats; if there is one, insert a booking. During a popular sale, two people get the same last seat. The database is PostgreSQL with default settings, and the code runs inside a transaction. Why didn't the transaction help, and how do you fix it?

<details>
<summary>Answer</summary>

A transaction gives **atomicity** (all its steps or none), but the default isolation level, Read committed (each statement sees only data committed before it ran), doesn't stop two transactions from reading "1 seat left" at the same time and both inserting. This is a check-then-insert race.

Options:

- A **unique constraint** on `(event_id, seat_id)`: the second insert fails, whatever the timing. The most reliable tool when the rule can be expressed as uniqueness.
- An **atomic update**: `UPDATE seats SET booked_by = ? WHERE id = ? AND booked_by IS NULL`; if no row changed, the seat is taken.
- **Locking** the row (`SELECT … FOR UPDATE`) or **Serializable** isolation for this part, with retries on serialization errors. Safe, but slower under contention.

</details>

## 2. "My change disappeared"

A user edits their profile name, clicks Save, sees "Saved", and the page reloads with the old name. A minute later the new name appears. No cache sits in front of this data. The logs show that the save went to the primary database, and the reload's query went to a read replica. What is happening, and what are the options?

<details>
<summary>Answer</summary>

The write went to the **primary** (the copy that accepts writes), but the reload read from a **replica** (a copy that follows the primary with some delay) that hadn't applied it yet: replication lag. The system is eventually consistent, but the user expects **read-your-own-writes**: after their own change, they always see it. (Without the logs, a stale cache would produce the same symptom, so check where the read was served from first.)

Options:

- Keep this user's reads on the primary after their write. Simple, but sending reads to the primary "for N seconds" fails when the lag is longer than N.
- Read from a replica only after checking it has applied the user's write (some databases return a position or version token for this).
- In the UI, show the value the server returned after the save instead of refetching it at once (see [client and server state](/architecture/state/#concurrent-changes)). This hides the problem on this screen only: the next reload or another tab can still read the old value, so combine it with one of the options above.

</details>

## 3. Two editors, one document

Two support agents open the same customer record. Agent A changes the phone number and saves. Agent B, who opened it earlier, changes the address and saves. The phone change is lost. How do you prevent this?

<details>
<summary>Answer</summary>

This is a **lost update**: B's save wrote the whole record, based on an old copy.

Use **optimistic locking**: store a version number, and update with `WHERE id = ? AND version = ?` while raising the version. If no row changed, someone else saved first: show a conflict and let the user reload or merge. Over HTTP the same idea is `ETag` (a version tag of the resource) with `If-Match`, answered by `412` on a conflict.

It is cheap and works well when conflicts are rare. Sending only the changed fields (a `PATCH`) also reduces the damage. Pessimistic locks ("this record is being edited by A") make sense only when conflicts are frequent and costly, because they block others and need a timeout for abandoned locks.

</details>

## 4. Payment succeeded, stock didn't

Checkout writes the order, charges the card through a payment provider, then reserves stock in a warehouse service. Sometimes the stock reservation fails after the card was charged. The team asks for "one transaction across all of it". What do you propose?

<details>
<summary>Answer</summary>

There is **no shared transaction** across your database, a payment provider and another service. Instead, design a **saga**: a sequence of local steps, each with a **compensating action**. If the stock step fails after payment, the compensation is a refund (or a back-order, if the business prefers).

Make each step **idempotent** with an [idempotency key](/architecture/api-styles/#error-boundaries), so retries never charge twice. Consider reserving stock **before** charging, so the most common failure needs no refund. And show intermediate states in the UI ("Payment received, confirming stock") instead of pretending the flow is instant. A workflow engine (Temporal, Step Functions, Inngest) can run the steps and retries durably.

</details>

## 5. The message that never went out

The code saves an order and then publishes an "order created" message for the warehouse. Every few days an order exists in the database, but the warehouse never hears about it. Why, and how do you fix it?

<details>
<summary>Answer</summary>

This is the **dual-write problem**: two writes to two systems, with no transaction between them. If the process crashes, is deployed or times out after the database commit but before the publish, the message is lost.

Use a **transactional outbox**: write the message into an `outbox` table **in the same transaction** as the order. A separate process reads the table and publishes the messages, retrying until it succeeds ([background jobs](/architecture/background-jobs/#getting-messages-out-reliably)). Messages may now be delivered more than once, so the warehouse must handle duplicates. Change data capture (CDC: streaming the database's own change log, for example with Debezium) is another way to read the outbox.

</details>

## 6. Exact like counts everywhere

Product wants the like count on posts to be exact and the same for every user in every region, instantly. The app is served from three regions. What do you tell them?

<details>
<summary>Answer</summary>

Ask what a wrong answer costs. For likes, a count that is a few seconds behind or slightly off costs almost nothing. Strong consistency across regions costs a lot: it needs coordination, so every like would go to one authoritative place or wait for regions to agree. That adds cross-region latency, and the feature fails when regions can't reach each other.

Use **eventual consistency** for the count. For the user's own like, update the button at once (an optimistic UI, rolled back on failure), and make sure their later reads don't go back to the old state, for example by reading their own likes from the primary: that is **read-your-own-writes**. The total may catch up a little later. Save strong guarantees for money, stock and bookings, where a wrong answer is expensive.

</details>
