---
title: CI/CD — check yourself
description: Scenario questions about pipeline speed, flaky tests, merge order, deployments and pipeline security.
quizFor: delivery/ci-cd
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A 40-minute pipeline

Every pull request runs a pipeline of 40 minutes: install, lint, type check, unit tests, build and the full end-to-end suite (tests that drive the whole app through a browser, like a user), all one after another. Developers have started merging without waiting for it. What would you change?

<details>
<summary>Answer</summary>

A slow pipeline stops being a safety net: people batch changes, stop waiting and merge anyway. Aim for fast feedback first:

- Run **cheap checks first** and **in parallel** (lint, types and unit tests as separate jobs, units of work that run on separate machines), so most failures show up in a few minutes.
- **[Cache](/architecture/caching/)** dependencies, keyed by the lockfile and tool versions, and build outputs, keyed by everything that affects them.
- **Split** the end-to-end suite across several machines, or run only a smoke subset (a short check of the most important flows) on pull requests and the full suite on main or nightly.
- In a [monorepo](/architecture/repository-layout/) (one repository for many projects), build and test only the **affected** projects (the changed ones and everything that depends on them), plus the prerequisite tasks they need, such as building an unchanged library or restoring it from the cache.

The trade-off of running fewer tests on pull requests: some failures are found only after the merge, so main must be watched and fixed fast.

</details>

## 2. Re-run until green

One end-to-end test fails about once in ten runs. The team's habit is to re-run the pipeline until it passes. What is the risk, and what should they do?

<details>
<summary>Answer</summary>

A **flaky test** (one that fails randomly) teaches people that red means nothing. Soon a real failure is re-run and merged too. Re-runs also waste time and machines.

Track flaky tests (most CI tools and test runners can report them), **quarantine** the test (run it, but don't let it block merges) so it doesn't hold the team hostage, give it an owner and fix the cause: usually timing (waiting for fixed delays instead of conditions), shared test data, or order dependence. Quarantine must be temporary: a test nobody fixes is just deleted coverage.

</details>

## 3. Two green pull requests, a red main

Pull requests A and B both passed CI. After both were merged, main fails to build: A renamed a function, and B added a new call to the old name. How do you prevent this?

<details>
<summary>Answer</summary>

Each pull request was tested against the **main of its time**, not against the other change. Both were green alone; together they break.

A **merge queue** tests each change on top of the current main plus the changes ahead of it in the queue, and merges only if that combination passes. The cost is some waiting at merge time. Short-lived branches and frequent merges (trunk-based development) also reduce the chance, because changes drift from main for a shorter time.

</details>

## 4. The old version came back

Two pull requests are merged into main a minute apart. Both pipelines deploy to production. A few minutes later, production runs the **older** change: the newer one is gone. What happened, and how do you prevent it?

<details>
<summary>Answer</summary>

The pipelines ran in **parallel**. The newer one finished first and deployed; the older one was slower (a cache miss, a busier runner, the machine that runs the jobs), finished last and overwrote production with its older artifact.

Allow **one deployment at a time per environment**, in order, and skip runs that are already outdated (most CI tools have a concurrency or "skip outdated deployment" setting). Be careful with cancelling a deployment that is already halfway; skipping it before it starts is safer.

</details>

## 5. Keys to production

A pipeline deploys to the cloud using a long-lived access key stored in the CI secrets. It also uses several third-party actions referenced by tag, such as `some-org/deploy-action@v4`. What are the risks, and how would you reduce them?

<details>
<summary>Answer</summary>

- A **long-lived key** works from anywhere until someone rotates it. If it leaks (a log, a compromised step), the attacker has production access for a long time.
- A **tag** can be moved. If the action's repository is compromised, the new code runs in your pipeline with your secrets. This happened in 2025 with `tj-actions/changed-files`, which exposed secrets in the logs of many repositories.

Improvements: use **OIDC federation** (based on [OpenID Connect](/security/auth/#oauth-2-and-openid-connect)), where the pipeline receives a temporary cloud token, and restrict the cloud role to your repository, branch or protected environment, with minimum permissions. **Pin actions to a full commit SHA** and update the pins deliberately. Give the pipeline's own token read-only rights unless a job needs more, and never expose secrets to pull requests from forks.

</details>
