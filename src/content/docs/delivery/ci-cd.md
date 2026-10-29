---
title: CI/CD pipelines
description: How a pipeline turns a commit into a tested artifact and promotes it to production — stages, jobs, runners, artifacts, environments, secrets — with Bamboo as a worked example.
related:
  - delivery/deployment-models
  - observability/logs-metrics-traces
  - security/auth
officialDocs:
  - title: Martin Fowler — Continuous Integration
    url: https://martinfowler.com/articles/continuousIntegration.html
  - title: GitHub Actions — Understanding GitHub Actions
    url: https://docs.github.com/en/actions/get-started/understand-github-actions
  - title: GitLab — CI/CD pipelines
    url: https://docs.gitlab.com/ci/pipelines/
  - title: Atlassian Bamboo — Understanding the Bamboo CI server
    url: https://confluence.atlassian.com/bamboo/understanding-the-bamboo-ci-server-289277285.html
  - title: Atlassian Bamboo — Deployment projects
    url: https://confluence.atlassian.com/bamboo/deployment-projects-338363438.html
  - title: GitHub Actions — Secure use reference
    url: https://docs.github.com/en/actions/reference/security/secure-use
  - title: DORA — Software delivery performance metrics
    url: https://dora.dev/guides/dora-metrics/
---

## What problem it solves

Many people change the same code every day. Without automation, problems pile up:

- "it works on my machine", but not on anyone else's;
- a broken main branch that someone discovers days later;
- releases done by hand, with steps that someone forgets;
- nobody sure which version is in production.

**CI/CD** automates the path from a commit to production. [Deployment models](/delivery/deployment-models/#releasing-from-commit-to-users) explains where code runs and how a new version reaches users; this page is about the machinery in between: the **pipeline**.

- **CI** (continuous integration): every change is built and tested automatically, and changes are merged into the main branch often.
- **CD**: either **continuous delivery** (every change *can* be released; a person decides when) or **continuous deployment** (every change that passes the checks is released automatically).

## Mental model: a commit becomes an artifact, the artifact is promoted

```
push / pull request
      │ trigger
      ▼
 [ build ] ─► [ lint │ type check │ unit tests ] ─► [ package artifact ] ─► staging ─► approval ─► production
                  jobs in parallel                   stored and versioned    the same artifact, promoted
```

The vocabulary, which every tool uses in some form:

- **Pipeline**: the whole automated flow for one change.
- **Stage**: a phase of the pipeline. Stages usually run in order, and a stage starts only when the previous one succeeded.
- **Job**: a unit of work that runs on one machine. Jobs in the same stage can run in parallel.
- **Step** (or task): one command inside a job, such as `npm ci` or `npm test`.
- **Runner** (or agent): the machine or [container](/delivery/containers/) that runs jobs.
- **Trigger**: what starts the pipeline: a push, a pull request, a schedule, another pipeline, a person.
- **Artifact**: what the pipeline produces and keeps: a build folder, a container image, a test report.
- **Environment**: a place the artifact is deployed to: development, staging, production.

Four principles make pipelines trustworthy:

1. **Build once, promote the same artifact.** The thing that reaches production is exactly the thing that was tested; only configuration differs per environment. That works only if those differences are really read at runtime: public variables in frontend bundles are baked in at build time ([configuration](/delivery/deployment-models/#mental-model-the-build-output-decides-the-runtime)). If the framework needs a separate build per environment, test that exact build.
2. **Pipeline as code.** The pipeline definition lives in the repository, is reviewed like code and versioned with it.
3. **Fast feedback first.** Cheap checks (lint, types, unit tests) run first and fail early; slow ones (end-to-end tests) run later or in parallel.
4. **Reproducible builds.** Pinned tool versions, lockfiles (files that record the exact version of every dependency), clean machines for every run.

## The same ideas in different tools

| Concept | GitHub Actions | GitLab CI/CD | Bamboo |
| --- | --- | --- | --- |
| Configuration | `.github/workflows/*.yml` | `.gitlab-ci.yml` | Bamboo Specs (YAML or Java) or the web interface |
| Pipeline | Workflow run | Pipeline | Plan, plus a deployment project for releases |
| Stage | No separate concept; jobs declare dependencies with `needs` | Stage | Stage |
| Job | Job | Job | Job |
| Step | Step | A line of `script` | Task |
| Machine | Runner | Runner | Agent |
| Deploy target | Environment | Environment | Environment of a deployment project |

## Bamboo as a worked example

Bamboo is Atlassian's self-hosted CI/CD server, often found in companies that use Jira and Bitbucket Data Center. (Atlassian's cloud CI service is Bitbucket Pipelines.) Its model maps cleanly onto the concepts above:

```
Project
 └─ Plan                      triggers, repository, variables
     ├─ Stage 1               stages run one after another
     │   ├─ Job A             jobs of a stage run in parallel, on different agents
     │   │   └─ Task, Task    tasks of a job run in order, on the same agent
     │   └─ Job B
     └─ Stage 2               starts only when every job of stage 1 succeeded

Deployment project            takes the plan's artifacts
 ├─ Release 1.4.2             a snapshot of tested artifacts
 └─ Environments, for example QA → Staging → Production
```

- A **plan** builds and tests. Its jobs define **artifacts**; a job can use artifacts produced in an earlier stage, and artifacts marked as shared can be used by deployments.
- **Agents** run jobs. A job states its **requirements** (for example, Node.js 22), and Bamboo sends it to an agent whose **capabilities** match.
- **Plan branches** reuse a plan's configuration for other branches, created automatically or by hand depending on the settings, with optional overrides.
- A **deployment project** turns the build output into **releases**: snapshots of tested artifacts with their commits and Jira issues. The same release is deployed to the **environments**, and each environment shows which release is running, who deployed it and when. This is "build once, promote the same artifact" built into the tool. The order (QA, then staging, then production) isn't automatic: each environment has its own triggers and permissions, which you set up to form that path.

## Pipeline design choices

- **Triggers.** Pull requests get fast checks; merges to main get the full suite and a deployment; scheduled runs catch slow problems (nightly end-to-end tests, dependency updates).
- **Branching.** CI means integrating often. With **trunk-based development**, branches live hours or days and unfinished features hide behind [feature flags](/delivery/deployment-models/#releasing-from-commit-to-users). Long-lived branches turn every merge into a big, risky event and make CI results less meaningful.
- **What runs when.** On a pull request: lint, types, unit tests, build, often a preview deployment. On main: the slower tests, publishing the artifact, deploying to staging. On release: production, with an approval if needed.
- **Speed.** [Cache](/architecture/caching/) what is expensive to recreate. A **dependency cache** is keyed by the lockfile plus the runtime and tool versions. A **build-output cache** must be keyed by everything that affects the result: source files, configuration and tools; build tools such as Turborepo or Nx compute this for you. Treat caches as a disposable speedup, never as release artifacts, and don't let untrusted jobs write caches that trusted jobs read. Also run jobs in parallel, split long test suites across machines, and in a [monorepo](/architecture/repository-layout/) (several projects in one repository) build and test only the projects a change affects.
- **Merge queues.** When many pull requests merge at once, each one passed its tests against an older main. A merge queue tests each change on top of the current main before merging, so main stays green.
- **Environments.** Protect production: required approvals, limited people who may deploy, and a visible history of what was deployed when.
- **One deployment at a time per environment.** Two pipelines from main can finish out of order: the newer one deploys, then the older one overwrites it. Run deployments to one environment one after another and skip runs that are already outdated; be careful with cancelling a deployment halfway, which can leave it half done.

## Secrets and security

A pipeline holds the keys to production, so it is a prime target.

- **Keep secrets in the CI system's secret store**, scoped to the environments that need them. Never commit them, and don't rely on log masking alone.
- **Prefer short-lived credentials.** With **OIDC federation**, the pipeline proves its identity to the cloud provider and receives a temporary token, so there is no long-lived cloud key to steal ([OpenID Connect](/security/auth/#oauth-2-and-openid-connect)). The cloud side must check who is asking: allow the role only for your repository, the right branch or protected environment and the expected audience, and give the role the minimum permissions.
- **Keep untrusted code away from trusted jobs.** Pull requests from forks run code written by anyone. They must not get your secrets, and that isn't enough: on a reused self-hosted runner they can leave changed files behind or reach private networks. Run them on clean, short-lived runners with restricted network access, and never run their code or artifacts later inside a privileged job.
- **Pin third-party actions and plugins to an exact, reviewed version**: a full commit SHA for GitHub Actions, exact versions or checksums for plugins and images, never a movable tag. Keep the pins updated. In 2025, a compromised popular GitHub Action (`tj-actions/changed-files`) exposed secrets in the logs of many repositories that used it by tag.
- **Least privilege** for the pipeline's own token: read-only unless a job needs more.
- **[Supply chain](/security/web-attacks/#supply-chain-code-you-didnt-write)**: install exactly what the lockfile says (`npm ci`), review dependency updates, and sign what you publish or attach provenance (a signed record of how and where it was built).

## Typical failures

- **Slow pipelines.** At 30 minutes or more, people batch changes, stop waiting and merge anyway.
- **Flaky tests** (tests that fail randomly). People re-run until green and start ignoring real failures. Track flaky tests, quarantine them and fix them.
- **A separate build per environment by accident**, so production runs an artifact that was never tested.
- **Overlapping deployments**, where an older pipeline finishes last and puts the old version back.
- **Different tool versions** in CI and on laptops: "works in CI, fails locally", or the reverse. Pin versions; use the same [container images](/delivery/containers/).
- **Secrets in logs**, or available to pull requests from forks.
- **Manual steps** in the release ("then connect to the server and run…").
- **Main is red for days** because nobody owns fixing it.
- **Copy-pasted pipeline files** across many repositories; use shared templates or reusable workflows.
- **Stale or poisoned caches**: an output cache keyed only by the lockfile restores old code, and a cache written by an untrusted job can inject code into a trusted one.

## How to choose

- **Where the code lives decides most of it:** GitHub → GitHub Actions; GitLab → GitLab CI/CD; Bitbucket Cloud → Bitbucket Pipelines; a self-hosted Atlassian setup → often Bamboo. Very large or unusual setups use Jenkins or Buildkite with their own agents.
- **Hosted or self-hosted runners:** hosted runners need no maintenance; self-hosted runners give access to private networks, special hardware or lower cost at scale, and you then own their security and updates; don't run untrusted pull requests on them.
- **A good first pipeline:** on every pull request, install → lint and types → unit tests → build; deploy main to staging automatically; deploy to production with an approval, or automatically once tests and [monitoring](/observability/logs-metrics-traces/) are trusted.
- **Measure the outcome** with the **DORA metrics**, currently five: deployment frequency, change lead time (from commit to production), change fail rate (how often a deploy needs a fix), failed deployment recovery time, and deployment rework rate (the share of deploys that are unplanned fixes for a production incident). Measure the pipeline itself separately: feedback time, queue time and the rate of flaky tests.

## Landscape

- **Hosted CI/CD:** GitHub Actions, GitLab CI/CD, Bitbucket Pipelines, CircleCI, Azure Pipelines, Google Cloud Build, AWS CodeBuild and CodePipeline.
- **Self-hosted or bring-your-own agents:** Jenkins, Atlassian Bamboo, JetBrains TeamCity, Buildkite, Woodpecker CI.
- **Deployment and GitOps** (a tool watches a Git repository describing the desired production state and applies it): Argo CD, Flux, Spinnaker, Octopus Deploy.
- **Build speed:** remote caching in Nx and Turborepo, Bazel, the Gradle build cache.
- **Security:** OIDC federation in cloud providers, Dependabot and Renovate, Sigstore, SLSA, OpenSSF Scorecard.
