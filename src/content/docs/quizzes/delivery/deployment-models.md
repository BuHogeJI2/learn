---
title: Deployment models — check yourself
description: Scenario questions about where code runs, state on instances, configuration and safe releases.
quizFor: delivery/deployment-models
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Avatars disappear after a deploy

Users upload avatars, and the app saves them to the server's `uploads/` folder. Everything works for weeks. After the move to a container platform (one that runs the app as [containers](/delivery/containers/)) with two instances (running copies of the app), some avatars show as broken, and after every deploy all of them are gone. Why?

<details>
<summary>Answer</summary>

The files live on the **instance's local disk**. That disk is not shared between instances, so a request served by the other instance can't find the file, and it doesn't survive a replacement, which every deploy does.

Treat every instance as **disposable**: store uploads in **object storage** (a storage service for files, such as S3 or R2), keep only their metadata in the database, and serve them through a [CDN](/web-platform/cdn/). The same rule applies to [sessions](/security/auth/#sessions-in-practice-the-lifecycle), in-memory caches that must be shared, and timers: anything that must outlive the process goes to an external service ([what survives a restart](/delivery/deployment-models/#state-what-survives-a-restart)).

</details>

## 2. `ChunkLoadError` after every release

After each release, [error tracking](/observability/error-tracking/) shows a spike of `ChunkLoadError` and failed API calls, mostly from users who had the app open before the deploy. A reload fixes it. What is happening, and what can you do?

<details>
<summary>Answer</summary>

**Version skew**: open tabs still run the old JavaScript. When the user navigates, the old code asks for code chunks that the new deploy deleted, or calls an API that changed.

Options, often combined:

- Keep **old static assets available** for a while after a deploy (content-hashed file names make this easy).
- Keep APIs **backward compatible** for at least as long as old tabs live.
- **Reload the page** when a chunk fails to load, ideally on the next navigation, not in the middle of the user's work.
- Use **skew protection** where the platform offers it: requests from old clients are routed to the old deployment.

</details>

## 3. The staging artifact calls the staging API

The team wants to test one build on staging (a production-like environment for checks) and then promote **the same artifact** (the built output) to production. After promotion, production pages call the staging API. The API URL is set as `VITE_API_URL` in each environment's settings. What went wrong?

<details>
<summary>Answer</summary>

Variables with a public prefix (`VITE_`, `NEXT_PUBLIC_`) are read at **build time** and copied into the JavaScript bundle. The artifact was built with staging values; changing the variable in production later changes nothing in files that are already built.

Options: load such values at **runtime** (a small config endpoint, or a script the server injects into the page), so one artifact works in every environment; or accept a **separate build per environment**, knowing that staging then tests a slightly different artifact. Remember that anything in the bundle is public: never put secrets there.

</details>

## 4. A rollback that didn't help

A release renamed a database column from `name` to `full_name` with a [migration](/data/schema-evolution/#expand-migrate-contract), and updated the code. An unrelated bug appeared, so the team rolled back to the previous version. The rollback made things worse: every page that reads users now fails. Why?

<details>
<summary>Answer</summary>

A rollback switches **code, not data**. The old code expects the `name` column, but the migration already renamed it. During a rolling deploy (instances replaced a few at a time, see [releasing](/delivery/deployment-models/#releasing-from-commit-to-users)), old and new code also ran at the same time against the same schema, so errors probably appeared even before the rollback.

Change the schema in **compatible steps** (expand, migrate, contract): add `full_name`, write to both, backfill, switch reads, deploy, and only later, when no version that you might roll back to needs `name`, drop it. Each step works with both the previous and the next version of the code.

</details>

## 5. Kubernetes for a small team?

A team of four builds a Next.js app with spiky traffic: quiet most of the day, ten times busier during evening promotions. One developer proposes running it on [Kubernetes](/delivery/kubernetes/) "to be ready for scale". What would you recommend?

<details>
<summary>Answer</summary>

For a small team with spiky traffic, a **platform** is usually the better choice: one that maps the app to static files and serverless functions (code the platform starts on demand: Vercel, Netlify), or a serverless container service (Cloud Run). They scale automatically, down to almost zero when idle, and nobody has to operate a cluster.

Kubernetes pays off when an organization runs many services and has people to operate it; for four developers it adds a lot of work without a clear gain. Watch the platform's limits instead: function duration, cold starts (the delay while a new instance starts), database connections from many instances, and the cost at high steady traffic. If those become a problem, long-running containers on a managed service are the next step.

</details>
