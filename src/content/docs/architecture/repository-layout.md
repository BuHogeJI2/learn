---
title: "Repository layout: monorepo and polyrepo"
description: One repository for many projects or one per project — how each handles code sharing, cross-project changes, versioning, CI and ownership, and what tooling a monorepo needs.
related:
  - architecture/application-boundaries
  - delivery/ci-cd
officialDocs:
  - title: monorepo.tools — Monorepo explained
    url: https://monorepo.tools/
  - title: Nx — What is a monorepo?
    url: https://nx.dev/docs/kb/what-is-a-monorepo
  - title: Turborepo — Structuring a repository
    url: https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
  - title: pnpm — Workspaces
    url: https://pnpm.io/workspaces
  - title: Changesets
    url: https://github.com/changesets/changesets
  - title: GitHub — About code owners
    url: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
---

## What problem it solves

A company with a web app, an admin panel, an API, a design system and a few shared utilities has to decide **where the code lives**: in one repository, or one per project. The choice affects how code is shared, how a change that touches several projects is made, how versions work, how long [CI](/delivery/ci-cd/) takes, and who owns what.

It is a different decision from how the system runs. A **monorepo** (one repository for many projects) can hold independently deployed microservices, and a single monolith can be split across several repositories. Runtime boundaries are covered in [Application boundaries](/architecture/application-boundaries/).

## Mental model: from source or from published versions

```
Monorepo                                   Polyrepo
repo/                                      web-app repo ───┐
  apps/web      ─┐                         admin repo ─────┤ depend on published
  apps/admin     ├─ import shared code     ui-kit repo ────┤ versions: ui-kit@3.2.0,
  apps/api       │  directly from source   utils repo ─────┘ utils@1.8.1
  packages/ui   ─┘
  packages/utils
one commit can change everything           one change = a PR and a release per repo
```

The usual arrangement, and the difference that matters:

- In a **monorepo**, projects usually use each other's code **from source**: everyone builds against the latest version, and a change and all its consequences fit in one commit and one review.
- In a **polyrepo** (one repository per project), projects usually use each other **through published versions**: each consumer decides when to upgrade, and a change travels through releases.

Neither is forced: a monorepo can publish independently versioned packages, and separate repositories can pin each other's source. What the layout really decides is one shared history versus several. And one commit is atomic in Git, not in production: apps from the same commit are still deployed separately, so changes between them must stay backward compatible.

## Monorepo and polyrepo compared

| | Monorepo | Polyrepo |
| --- | --- | --- |
| **Sharing code** | Import directly; nothing to publish | Publish a package, version it, update every consumer |
| **A change across projects** (rename a shared API) | One commit and one review, checked together | Coordinated pull requests in several repositories, released in the right order |
| **Versions** | Usually everything works at the latest commit; packages can still be versioned and published | Each repository has its own version and release schedule |
| **Third-party dependencies** | One version policy is possible (one React for all apps) | Each repository may drift to different versions |
| **CI** | Must be smart: build and test only what a change affects, with [caching](/architecture/caching/) of results | Simple per repository; testing projects together is harder |
| **Ownership and access** | Owners per folder (`CODEOWNERS`); everyone can usually read everything | Permissions per repository, naturally separated |
| **Tooling** | Workspaces plus a build system; special care for very large repositories | Standard tools, but shared configuration tends to drift |
| **Fits** | One organization or product, shared design system and types, frequent cross-cutting changes | Independent teams or products, open-source libraries, different release cycles, strict access separation |

Many companies end up in between: a few monorepos, one per domain or per group of teams.

## How a JavaScript monorepo works

- **Workspaces** (in npm, pnpm, Yarn or Bun): several packages in one repository. Each package declares its dependencies, and the package manager links local packages according to its workspace rules (pnpm's `workspace:` references, for example, guarantee that the local copy is used, not a version from the registry).
- **A task runner or build system** (Turborepo, Nx) that knows the dependency graph between packages and between tasks (`test` needs the `build` of the packages it uses). In CI it compares the change with a base commit and runs the tasks of the **affected** projects (the changed packages plus everything that depends on them) with their prerequisites, in the right order and in parallel. The graph and the base must be configured correctly: a missing dependency or a wrong base silently skips checks.
- **Caching, locally and remotely** ([pipeline speed](/delivery/ci-cd/#pipeline-design-choices)): the tool fingerprints a task's inputs (source, configuration, tool and dependency versions, relevant environment variables) and stores the task's outputs and logs under that fingerprint. A **remote cache** shares them, so a teammate or a clean CI machine restores the result instead of rebuilding it. That is correct only if every input that matters is in the fingerprint and the outputs are declared; otherwise a cache hit restores a wrong build. Cached logs are shared data, so never print secrets in them.
- **Module boundary rules**: which package may import which, enforced by tooling, so the monorepo doesn't become one big tangle ([modular boundaries](/architecture/application-boundaries/#modular-monolith)).
- **Shared configuration**: TypeScript, lint and formatting settings defined once.
- **Code owners**: a `CODEOWNERS` file names the owners of each folder and requests their review; making that review required is a separate branch-protection setting. It doesn't hide code: everyone with access to the repository can read every folder.
- **Publishing, when needed**: packages that are also used outside the repository get versions and changelogs from a tool such as Changesets.

Internal packages come in two styles: consumed **from TypeScript source** directly by the apps (simple, no separate package build, but the tooling of every consuming app must be able to compile that source), or **built first** and used as compiled output (more setup, but the package is built once and cached on its own).

## Polyrepo done well

- **Shared libraries** live in a private registry with semantic versioning (`major.minor.patch`, where a new major version means breaking changes), and automated pull requests (Renovate, Dependabot) keep consumers up to date.
- **Templates and reusable CI workflows** stop configuration from drifting between repositories.
- **[Contract tests](/architecture/testing/#test-types-and-what-they-prove)** (checks that a provider still matches what its consumers expect) and compatibility rules protect the APIs between projects ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost)).
- A side benefit: separate repositories force clear, versioned boundaries.

## Typical failures

- **A monorepo without tooling**: every pull request runs every test, and CI takes an hour.
- **A monorepo where everything imports everything**: the projects grow into one tangle that nobody can split again.
- **Believing a monorepo means deploying everything together.** Each app in it can still build and deploy on its own.
- **One broken shared package breaks the build of every app that uses it.** Apps already deployed keep running, but nothing ships until it is fixed. Good tests and affected-project CI catch it before merging.
- **Incomplete cache inputs**: an environment variable or configuration file missing from the fingerprint, so CI restores a stale build and reports success.
- **A polyrepo with a shared library that changes every week**: constant upgrade work, and several versions of the same library in one app (with React, two copies cause errors that are hard to understand).
- **Version conflicts**: two libraries that need different versions of a third one.
- **Code or configuration visible to everyone** that needed its own access boundary, such as a separate repository. Secrets belong in no repository at all: they live in CI and runtime secret stores ([secrets](/delivery/ci-cd/#secrets-and-security)).
- **Choosing by fashion** instead of by how changes actually happen.

## How to choose

Optimize for the most common kind of change:

- **Changes often span projects** (a frontend, a backend and shared types change together): a monorepo with workspaces and a build system such as Turborepo or Nx. This is the usual choice for a small or mid-size product team.
- **Projects rarely change together**, belong to independent teams, use different languages, or need strict access separation: separate repositories, or one monorepo per domain.
- **Very large organizations** run huge monorepos (Google, Meta) only with heavy custom tooling.

Whatever you choose, decide the runtime boundaries separately: the repository layout doesn't decide what is deployed together.

## Landscape

- **Workspaces:** pnpm, npm, Yarn and Bun workspaces.
- **Monorepo build systems:** Turborepo, Nx, Bazel, Pants, Rush, moon; Lerna (now maintained by the Nx team).
- **Versioning and releases:** Changesets, semantic-release, release-please.
- **Dependency updates:** Renovate, Dependabot.
- **Very large repositories:** Git sparse checkout (only some folders in the working copy) and partial clone (Git objects downloaded only when needed).
- **Ownership:** `CODEOWNERS` in GitHub and GitLab.
