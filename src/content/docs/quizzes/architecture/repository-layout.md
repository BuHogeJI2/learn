---
title: Monorepo or polyrepo — check yourself
description: Scenario questions about repository layout, monorepo CI, caching and shared libraries.
quizFor: architecture/repository-layout
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Three repositories, one team

One team of eight builds a web app, an admin panel and a TypeScript API, each in its own repository. Shared types and a UI kit are published as private packages. Almost every feature changes the API, the types and one of the apps, and each change means three pull requests and two package releases. What would you suggest?

<details>
<summary>Answer</summary>

Optimize for the most common kind of change. Here changes **span projects** all the time, so a **monorepo** (one repository for many projects) fits: workspaces (several packages in one repository, linked to each other locally by the package manager) link the shared packages from source, and a change and its consequences fit in one commit and one review, checked together.

Add the tooling from the start: a build system (Turborepo, Nx) that runs in [CI](/delivery/ci-cd/) (the automatic checks on every change) only the tasks of the **affected** projects (the changed ones plus everything that depends on them), with caching, and [module boundary](/architecture/application-boundaries/#modular-monolith) rules so packages don't import each other freely. Keep the deployments separate: moving to one repository doesn't mean the apps must be deployed together.

</details>

## 2. An hour of CI for every pull request

After moving to a monorepo, every pull request runs every build and every test of every app. CI takes an hour, even for a typo in the admin panel. What is missing?

<details>
<summary>Answer</summary>

The monorepo has no **build system** that knows the dependency graph. With one (Turborepo, Nx), CI compares the change with a base commit and runs tasks only for the **affected** projects (the changed packages plus everything that depends on them), plus the tasks they need first (for example building an unchanged library the app imports, or restoring its output from the cache), in parallel and in the right order.

Add a **remote cache**: the tool fingerprints each task's inputs and stores its outputs, so a clean CI machine restores results that a teammate or an earlier run already produced. The trade-off: both depend on correct configuration. A missing dependency in the graph or a wrong base commit silently skips checks.

</details>

## 3. Green CI, broken production

CI passed and restored the web app's build from the remote cache. But the deployed app calls the staging API: the `NEXT_PUBLIC_API_URL` variable was changed for production yesterday. What happened?

<details>
<summary>Answer</summary>

The environment variable is an input of the build (it is inlined into the client bundle), but it was **missing from the cache fingerprint**. The tool saw the same source and configuration, found a matching entry and restored an old build made with the old value.

Declare every input that changes the output: environment variables, configuration files, tool versions. Most build systems have a setting for the environment variables a task depends on. The general lesson: a cache is only correct if its key covers everything that matters, the same rule as for any [cache](/architecture/caching/).

</details>

## 4. "One commit, so it's atomic"

In a monorepo, a developer renames a field in the API and updates the web app in the same commit. After the merge, the web app deploys two minutes before the API, and for those two minutes the app is broken. "But it was one commit!" What did they miss?

<details>
<summary>Answer</summary>

One commit is **atomic in Git, not in production**. The apps from that commit are still built and deployed separately, at different times, and for a while old and new versions run side by side (users also keep old app versions open in their tabs).

Changes between separately deployed parts must stay **backward compatible**: add the new field, deploy the API, switch the app to it, and remove the old field later (expand and contract, see [API evolution](/architecture/api-styles/#evolution-the-long-term-cost)). The monorepo makes the change easier to review, not safe to deploy in any order.

</details>

## 5. Four versions of the UI kit

A company keeps a shared UI kit in its own repository and publishes it as a package. It changes almost every week. Five apps use it, on four different versions, and one app shows strange React errors after a dependency pulled in a second copy of React. What are the options?

<details>
<summary>Answer</summary>

A library that changes weekly makes a **polyrepo** (one repository per project, sharing code through published package versions) costly: every consumer has upgrade work, versions drift, and duplicated dependencies appear (two copies of React break hooks and context).

Options:

- Stay with separate repositories but automate: **Renovate or Dependabot** pull requests for upgrades, React as a **peer dependency** of the UI kit (the app provides React) and left out of the kit's published bundle, then a check that the app and the kit resolve the same copy; clear semantic versioning (version numbers that signal breaking changes with a new major version) and changelogs.
- Move the UI kit and the apps that change with it into a **monorepo**, so they all build against the latest version and a breaking change is fixed in the same commit.

The choice depends on how independent the apps really are. If separate teams with their own release schedules own them, the first option keeps their independence; if one organization changes them together, the second removes the upgrade work.

</details>
