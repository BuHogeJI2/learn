---
title: Schema evolution
description: How to change stored data safely while old and new code run at the same time — migrations, backfills, expand and contract, locks and the limits of rollback.
related:
  - data/database-types
  - data/consistency
  - delivery/deployment-models
  - delivery/disaster-recovery
officialDocs:
  - title: PostgreSQL — ALTER TABLE
    url: https://www.postgresql.org/docs/current/sql-altertable.html
  - title: PostgreSQL — Building indexes concurrently
    url: https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY
  - title: PostgreSQL — Explicit locking
    url: https://www.postgresql.org/docs/current/explicit-locking.html
  - title: MySQL — Online DDL operations
    url: https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-operations.html
  - title: Martin Fowler — Parallel Change
    url: https://martinfowler.com/bliki/ParallelChange.html
  - title: Martin Fowler — Evolutionary Database Design
    url: https://martinfowler.com/articles/evodb.html
---

## What problem it solves

Code can be replaced in seconds. Data can't: it is already there, there is a lot of it, and the running application depends on its exact shape. So changing a database is the riskiest routine task in many systems.

The problem has three parts:

- **Time.** During a [rolling deploy](/delivery/deployment-models/#releasing-from-commit-to-users) (instances replaced a few at a time), old and new code run together against one database. Every schema state must work with both.
- **Locks.** A change that looks like one line can block all reads and writes on a big table for minutes.
- **No way back.** A [rollback](/delivery/deployment-models/#releasing-from-commit-to-users) (returning to the previous version) replaces code, not data. A dropped column is gone.

The rule that follows: **separate the schema change from the code change, and make each step compatible with its neighbors**.

## Mental model: three things that change at different speeds

```
schema      structure: tables, columns, constraints, indexes     quick to run, may lock
data        the rows: backfills, new formats                     slow, hours on big tables
code        what reads and writes them                           deployed separately, not atomic
```

A **migration** is a versioned script that changes the schema. Migrations are stored with the code, run in order, and recorded in a table in the database, so every environment can be brought to the same state. That is the easy part, and a migration tool only orders and records the changes; it doesn't make the SQL inside them safe. A **backfill** (filling new columns for existing rows) is a separate job, because it can take hours and shouldn't hold a [transaction](/data/consistency/#transactions-and-acid) (an all-or-nothing group of writes) or a deploy open that long.

"Schemaless" databases don't escape this. [The schema moves into your code](/data/database-types/#relational-or-document-the-decision-that-matters-most), so old and new document shapes live side by side until something converts them.

## Expand, migrate, contract

The standard way to make a breaking change without downtime is to turn it into several compatible steps. This is the same idea as [API evolution](/architecture/api-styles/#evolution-the-long-term-cost), applied to a database. Renaming `name` to `full_name`:

| Step | Schema | Code | Safe to roll back? |
| --- | --- | --- | --- |
| 1. **Expand** | Add `full_name`, nullable | Old code keeps working and ignores it | Yes |
| 2. **Write to both** | No change | Write `name` and `full_name` in one transaction, read `name` | Yes |
| 3. **Backfill** | No change | After every writer writes both, a job copies old rows in batches | Yes |
| 4. **Switch reads** | No change | Read `full_name`, still write both | Yes |
| 5. **Stop old writes** | No change | Use only `full_name` | Only to a version that reads `full_name`: `name` goes stale from here |
| 6. **Contract** | Drop `name` | Nothing uses it any more | No: the data is gone |

It takes several deploys for one rename, and that is the price. Each step can run for days, can be checked on real traffic, and can stop safely.

Two gates make it work. **Start the backfill only when every writer writes both columns**: old instances, workers and one-off scripts. An old writer that changes only `name` afterwards leaves `full_name` stale, and no later check will fix it for good. **Keep writing both until you no longer need to roll back to a version that reads `name`.** After step 5, returning to such a version means syncing the column first.

For a small app that can stop for a minute at night, a single migration with a short maintenance window is a reasonable choice. Expand and contract pays off when downtime isn't acceptable.

## What is safe to run

Whether a change is cheap depends on the database, the version and the table size. The questions are the same everywhere: **does it rewrite the table, and what lock does it hold, for how long?**

Typical cases in PostgreSQL, as one example (most `ALTER TABLE` forms take its strongest lock, so "fast" doesn't mean "no lock"):

| Change | Risk | Safer way |
| --- | --- | --- |
| Add a nullable column | Very short lock | Fine as it is |
| Add a column with a constant default | Short lock; no rewrite in current versions | Fine; a volatile default such as `random()` does rewrite the table |
| Add a `NOT NULL` column | Fails or scans existing rows | Add nullable, backfill, then add a `CHECK` constraint as `NOT VALID`, validate it, then set `NOT NULL` |
| Add an index | Blocks writes while it builds | `CREATE INDEX CONCURRENTLY`: slower, it can't run inside a transaction, and a failed build leaves an invalid index to clean up |
| Add a foreign key or `CHECK` | Scans the table under a lock | Add as `NOT VALID`, then `VALIDATE CONSTRAINT`, which allows writes |
| Change a column's type | Often rewrites the whole table | Expand and contract with a new column |
| Rename or drop a column | Instant in the database, breaks running code | Expand and contract |

**The hidden trap is the lock queue.** A quick `ALTER TABLE` needs an exclusive lock, even for a moment. If a long-running query holds the table, the `ALTER` waits, and **every new query on that table waits behind it**. A one-millisecond change can stop the site. Set a `lock_timeout` so that the migration gives up quickly, and retry it.

MySQL has its own rules: many changes run in place or instantly, depending on the operation and version. For the rest, tools such as gh-ost copy the table in the background and swap it at the end.

## Backfills

- **Work in small batches**, with a pause between them, so the load on the primary stays low and [replicas](/data/consistency/#copies-and-consistency-models) don't fall behind.
- **Make it resumable.** Track progress by primary key, so a crash doesn't start from zero.
- **Make it idempotent.** Running it twice must be harmless ([background jobs](/architecture/background-jobs/#delivery-guarantees-at-least-once-is-the-norm)).
- **Never overwrite newer data.** Update only rows that are still empty, or check a version, so that a slow batch can't replace what a user just saved.
- **Verify** at the end: count the rows that still differ before you switch reads.

## Migrations and deploys

- **Who runs them.** A step in the [pipeline](/delivery/ci-cd/) (the automated path to production) before the new code, or a separate job. Not every app instance at startup: several instances then race, and a slow migration makes every instance fail its health check (the platform's test that an instance works).
- **Run them once.** Make sure two runs can't overlap: some migration tools take a lock in the database, others don't, so check yours and add a lock or a single job if needed.
- **Forward fixes over down migrations.** A "down" script can't restore data that was deleted, and it is rarely tested. If a step fails, a new forward migration is usually safer. Expand and contract keeps the previous code working, so rolling code back doesn't require rolling the schema back.
- **Back up before destructive steps**, and know how long a restore takes ([disaster recovery](/delivery/disaster-recovery/)).
- **Rehearse on production-sized data.** A migration that takes a second on a test database can take an hour on a big table.
- **Check migrations in CI**: lint them for unsafe operations and run them against a copy of the schema.

Clients are part of this. A mobile app or a browser with an open tab can use old fields for a long time, and [offline stores](/web-platform/offline-and-storage/#offline-writes-the-expensive-part) on users' devices have their own migrations that run when the app updates.

## Typical failures

- **Renaming a column in one deploy.** During the rollout, old code asks for a column that no longer exists.
- **Dropping a column in the same release that stops using it.** Old instances still read it, and a rollback is impossible.
- **`CREATE INDEX` without `CONCURRENTLY`** on a busy table: writes stop.
- **A quick `ALTER` queued behind a long query**, which stops all traffic on the table.
- **A backfill in one transaction**: long locks, replica lag and a huge rollback if it fails.
- **Migrations that run at app startup**, on every instance.
- **Mixing schema and data changes** in one migration, so a long data step keeps a schema lock.
- **ORM auto-sync in production** (an ORM maps database rows to objects in your code, and this feature makes the schema match them): it can drop a column because a field was renamed.
- **A successful migration, but a code path nobody noticed**: a reporting query, a background worker, or another team's service still using the old column.
- **Trusting a down migration** that was never run.

## When to use what

- **Small app, a short maintenance window is fine:** plain migrations, in one step.
- **No downtime allowed, or several app instances:** expand and contract for every breaking change, and split additive changes from destructive ones.
- **Tables with hundreds of millions of rows:** treat each change as a small project, with online schema tools, throttled backfills and a rehearsal.
- **Several services or teams reading the data:** name an owner, list every consumer and agree on a compatibility window. Where it makes sense, separate ownership over time ([data boundaries](/architecture/application-boundaries/#mental-model-three-kinds-of-boundaries)), because a shared table makes each change a cross-team negotiation.

## Landscape

- **Migration tools:** Flyway, Liquibase, Atlas; framework tools such as Prisma Migrate, Drizzle Kit, Rails migrations, Django migrations, Alembic.
- **Online schema change:** gh-ost and pt-online-schema-change (MySQL), pgroll (PostgreSQL), Vitess online DDL.
- **Safety checks:** Squawk and strong_migrations, which flag dangerous operations before they run.
- **Branching:** database branches in Neon and PlanetScale for testing migrations; make sure the branch holds production-sized data, because a schema-only copy hides lock and backfill costs.
