---
title: Database types
description: Relational, document, key-value, search, graph and other stores — what each is good at, and how to choose by the way data is read and written.
related:
  - data/consistency
  - architecture/caching
  - architecture/api-styles
officialDocs:
  - title: PostgreSQL — Concepts (tutorial)
    url: https://www.postgresql.org/docs/current/tutorial-concepts.html
  - title: MongoDB — Data modeling
    url: https://www.mongodb.com/docs/manual/data-modeling/
  - title: Redis — Data types
    url: https://redis.io/docs/latest/develop/data-types/
  - title: Use The Index, Luke — SQL indexing explained
    url: https://use-the-index-luke.com/
  - title: Amazon DynamoDB — NoSQL design
    url: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html
---

## What problem it solves

Every app stores data, and the database decides which questions are easy to ask, which guarantees you get, how the system grows, and how much it costs to run. It is one of the hardest decisions to change later: code is rewritten, but data stays and has to be migrated.

For a frontend developer this shows up as: how the API can paginate and filter, whether search is possible, whether "my change disappeared" bugs happen, and, in full-stack frameworks and [serverless](/delivery/deployment-models/) platforms (code that the platform starts on demand, with no server running all the time), which database you pick for your own project.

## Mental model: a data structure on disk, plus guarantees

Every database is a combination of four things:

1. **Data model**: tables, documents, key-value pairs, graphs.
2. **Indexes**: which lookups are fast.
3. **Guarantees**: transactions and consistency (see [Data consistency](/data/consistency/)).
4. **[Scaling](/architecture/scaling/) model**: one machine, copies, or data split across many machines.

So you choose by **access patterns**: what you read and write, how often, and by which key or condition.

**Indexes** decide speed more than the database brand. Without an index, finding rows means reading all of them. An index (usually a B-tree, a sorted tree structure) is a sorted copy of some columns that points to the rows, so lookups and ranges on those columns are fast. The cost: every write also updates the indexes, and they take space. Most "the database is slow" problems are a missing index or a query that can't use one.

A second split is by workload:

- **OLTP** (online transaction processing): many small reads and writes, such as "load this order" or "add to cart". This is the app's main database.
- **OLAP** (online analytical processing): few big queries that scan millions of rows, such as "revenue per country per month". Usually a separate system that stores data by column.

## Database types

| Type | Data model | Strong at | Weak at | Examples |
| --- | --- | --- | --- | --- |
| **Relational** (SQL) | Tables with a fixed schema (the declared columns and their types); relations through keys; joins (combining rows of several tables in one query) | Flexible queries, constraints, transactions, questions you didn't plan for | Scaling writes across machines; schema changes need [migrations](/data/schema-evolution/) | PostgreSQL, MySQL, SQLite, SQL Server |
| **Document** | JSON-like documents, nested; flexible shape | Reading and writing a whole object at once; data with varying shapes | Relations between documents; joins | MongoDB, Firestore, Couchbase |
| **Key-value** | A value under a key | Very fast simple access: [caches](/architecture/caching/), sessions, counters, [rate limits](/architecture/reliability/#protecting-a-service-from-overload) (caps on how often a client may call) | Any query that isn't by key | Redis, Valkey, Memcached, Cloudflare KV, DynamoDB (also documents) |
| **Wide-column** | Rows grouped by a partition key, spread over many machines | Huge write volume with access by known keys | Ad-hoc queries; you design tables per query | Cassandra, ScyllaDB, Bigtable, HBase |
| **Search engine** | An **inverted index** (word → documents that contain it) | Full-text search, relevance ranking, typos, filters with counts (facets) | Being the source of truth; updates appear with a delay | Elasticsearch, OpenSearch, Meilisearch, Typesense, Algolia |
| **Graph** | Nodes and edges | Queries over many hops: friends of friends, recommendations, fraud rings | Simple high-volume reads and writes | Neo4j, Amazon Neptune |
| **Time-series** | Measurements over time | Heavy ingest of metrics and events; time windows; downsampling | General-purpose data | TimescaleDB, InfluxDB, Prometheus |
| **Analytical** (columnar) | Data stored by column | Aggregations over billions of rows | Many small writes; fetching single rows | ClickHouse, BigQuery, Snowflake, DuckDB |
| **Vector** | Embeddings (lists of numbers that capture meaning) | Similarity search: semantic search, AI retrieval | Exact queries | pgvector, Pinecone, Qdrant, Weaviate |

Files (images, video, uploads) belong in **object storage** (Amazon S3, Cloudflare R2), with only their metadata in the database.

## Relational or document: the decision that matters most

**Relational** fits when data has many relations, you will query it in ways you don't know yet, and correctness matters: users, orders, payments, inventory.

**Document** fits when data is naturally a **self-contained object** that is read and written as a whole and whose shape varies: a [CMS](/data/cms/) page made of blocks, a product with many variant attributes, event payloads.

An order with items, both ways:

```
Relational                                Document
orders(id, user_id, created_at)           {
order_items(order_id, product_id,           "_id": 42, "userId": 7,
            qty, price)                     "items": [
products(id, name, price)                     { "productId": 3, "name": "Lamp",
→ join the tables to show an order              "qty": 1, "price": 49 } ] }
                                          → one read shows the whole order
```

This shows the core trade-off:

- **Normalization**: store each fact once and join at read time. Writes are simple and nothing gets out of sync.
- **Denormalization**: copy data to where it is read. Reads are fast, but you must keep the copies in sync. (For orders, copying the name and price is actually correct: the order must keep the price at the time of purchase.)

The line has blurred: PostgreSQL has `JSONB` columns with indexes, and MongoDB has multi-document transactions and joins. The difference is in the defaults and what is natural, not in what is possible.

"Schemaless" is a myth. The schema moves from the database into your code, and you still have to handle old shapes of data, only later and in the application.

## One primary database, specialized helpers

A typical setup:

```
            ┌─► Redis            cache, sessions, rate limits, queues
App ──► PostgreSQL (source of truth)
            ├─► Search engine    fed from the primary, for full-text search
            ├─► Object storage   files
            └─► Warehouse        copies for analytics
```

Each extra store is another copy that can be stale ([consistency](/data/consistency/#copies-and-consistency-models)) and another system to run. Start with one database: PostgreSQL alone can do JSON documents, full-text search, simple queues and vectors. Add a specialized store when you have measured a need.

## Scaling, briefly

- **Vertical**: a bigger machine. It goes further than most people expect.
- **Read replicas**: copies that serve reads. They lag behind the primary, which causes stale reads.
- **Partitioning**: splitting a big table into pieces by a key (for example by month) inside one database. It makes large tables easier to manage and some queries faster, but adds no machines.
- **Sharding**: splitting data by a key across several machines, each holding a part. Queries and transactions across shards become hard, and the key is hard to change.
- **Connection limits**: [serverless functions](/delivery/deployment-models/) can open thousands of connections and exhaust a SQL database. Use a connection pooler or an HTTP-based driver.
- **Distributed SQL** (Spanner, CockroachDB, YugabyteDB, TiDB): SQL and transactions spread over many machines, paid for with higher latency and cost.

## Typical failures

- **Choosing for scale you don't have**: a distributed database for an app with a thousand users.
- **Missing indexes**, and N+1 queries from an ORM (a library that maps tables to objects in your code) that loads related rows one by one ([N+1](/architecture/api-styles/#how-they-compare)).
- **Treating a cache or a search index as the source of truth**, then losing data on restart or reindex.
- **A document database for highly related data**: joins in application code and copies that drift apart.
- **Documents that grow without limit**, such as all comments inside a post document.
- **Exhausting connections** from serverless functions.
- **Files stored as blobs in the database.**
- **The table structure exposed as the API**, so the database can never change.

## How to choose

Ask:

1. What are the main reads and writes? By key, by range, by many filters, by text?
2. How related is the data? Do you need joins and constraints?
3. Which operations must be all-or-nothing?
4. How much data, and how many writes per second, now and in two years?
5. What does the team know, and will it be managed by a provider?

A sensible default for most apps: **a managed relational database as the primary store**. Add a key-value store for caching and short-lived data, a search engine when the database's built-in search is not enough, and a warehouse when analytics queries start to slow the main database.

## Landscape

- **Managed relational:** Supabase, Neon, Amazon RDS and Aurora, Google Cloud SQL, PlanetScale. SQLite at the edge: Turso, Cloudflare D1.
- **Document:** MongoDB Atlas, Firestore, Couchbase.
- **Key-value:** Redis, Valkey (an open-source fork of Redis), Upstash, DynamoDB, Memcached.
- **Search:** Elasticsearch, OpenSearch, Meilisearch, Typesense, Algolia.
- **Analytics:** ClickHouse, BigQuery, Snowflake, DuckDB.
- **Access layers:** ORMs and query builders (Prisma, Drizzle, TypeORM, Kysely). They change how you write queries, not what the database can do.
