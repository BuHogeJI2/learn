---
title: Database types — check yourself
description: Scenario questions about choosing a database, indexes, search and scaling.
quizFor: data/database-types
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. "MongoDB, because it scales"

A new SaaS product has users, teams, subscriptions, invoices and payments. It has a few hundred customers. A teammate proposes MongoDB "because it scales better". What do you recommend?

<details>
<summary>Answer</summary>

Choose by **access patterns and relations**, not by scale you don't have. This data is highly related (users belong to teams, invoices to subscriptions), you will query it in ways you don't know yet (reports, support tools), and payments need all-or-nothing [transactions](/data/consistency/) and constraints. That is the home ground of a **relational** database.

A managed PostgreSQL fits this workload with plenty of room to grow: a bigger machine, and read replicas (copies of the database that serve reads). MongoDB can do joins and multi-document transactions too, but its natural model is self-contained documents; for data this related you would spend effort on keeping references and copies consistent across documents. Measure the real workload as it grows rather than choosing for scale up front.

</details>

## 2. Search with typos

Product search uses `WHERE name ILIKE '%lamp%'`. It is slow on 2 million products, finds nothing for the typo "lmap", ranks results in no useful order, and product wants facets (filter counts by brand and price). What are your options?

<details>
<summary>Answer</summary>

A `LIKE` with a `%` wildcard at the start can't use a normal [index](/data/database-types/#mental-model-a-data-structure-on-disk-plus-guarantees) (a sorted structure that makes lookups fast), so it scans every row, and it knows nothing about typos, word forms or relevance.

Options:

- **The database's built-in full-text search** (PostgreSQL `tsvector` with a GIN index, plus `pg_trgm` for typos). No new system; good enough for many products.
- **A search engine** (Elasticsearch, OpenSearch, Meilisearch, Typesense, Algolia): an **inverted index** (a map from each word to the documents that contain it) built for relevance, typos and facets. It is fed from the primary database and lags behind it, so the database stays the source of truth.

Start with the built-in option if it meets the requirements; add a search engine when relevance and facets matter enough to pay for another system and its sync.

</details>

## 3. The order list got slow

"My orders" was fast at launch. A year later it takes 3 seconds. The query is `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`. The database server isn't busy. What is the likely cause?

<details>
<summary>Answer</summary>

A **missing index**. Without an index on `user_id` (better: on `(user_id, created_at)`), the database reads the whole growing table to find one user's orders, and then sorts them. It was fast while the table was small.

Check with the query plan (`EXPLAIN`). With a composite index on `(user_id, created_at)`, the database jumps to that user's rows, already in order, and reads only 20. The cost: every insert also updates the index, and it takes disk space. Most "the database is slow" problems are this, not the brand of the database.

</details>

## 4. "Too many connections"

An API on [serverless functions](/delivery/deployment-models/) works fine, but during traffic spikes PostgreSQL rejects requests with "too many connections". The database CPU is low. What is going on?

<details>
<summary>Answer</summary>

Each function instance opens its own database connection, and a spike starts hundreds or thousands of instances. A SQL database supports a limited number of connections, and each one costs memory, even if it is mostly idle.

Fixes: put a **connection pooler** (a proxy that lets many clients share a small number of database connections) between the functions and the database (PgBouncer, or the pooler built into managed providers such as Supabase and Neon), use an **HTTP-based driver** that the provider offers, or limit the function concurrency. The trade-off of a pooler in transaction mode: some session features (prepared statements, session settings) behave differently, so check that your ORM (the library that maps tables to objects in your code) supports it.

</details>

## 5. Analytics slows down checkout

The business team runs reports like "revenue per country per month" against the main database. When they run, checkout gets slow. What do you do?

<details>
<summary>Answer</summary>

These are **OLAP** queries (scan millions of rows) running on an **OLTP** database (many small reads and writes). They compete for the same CPU, memory and disk.

Options, from small to big:

- Run reports on a **read replica**, so they don't touch the primary. Cheap, but row-based storage is still slow for large scans, and the replica lags a little.
- Copy data into an **analytical (columnar) store** such as ClickHouse, BigQuery or Snowflake, which is built for aggregations over billions of rows. More moving parts and a sync pipeline, but reports get fast and the app's database is left alone.

</details>

## 6. Pages made of blocks

A [CMS](/data/cms/)-like page builder (a tool where editors compose pages from ready-made blocks) stores pages made of blocks (hero, text, gallery, form), each with its own fields, and new block types appear every month. The rest of the app uses PostgreSQL. Do you need a document database?

<details>
<summary>Answer</summary>

Probably not. A page is a **self-contained object** read and written as a whole with a varying shape, which is the document model's strength. But PostgreSQL can store it in a `JSONB` column (JSON stored in a binary form that can be indexed and queried), with indexes on the fields you query, next to the relational data (authors, permissions, publishing state) that benefits from joins (combining rows of several tables in one query) and transactions.

One database is less to run and keep consistent. Consider a separate document store only if most of the app becomes document-shaped. Either way, the schema doesn't disappear: your code must still handle old block shapes, so version them.

</details>
