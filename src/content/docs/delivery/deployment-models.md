---
title: Deployment models
description: Where your code runs after the build — static hosting, long-running servers, containers, serverless and edge functions — and what each means for state, limits, releases and cost.
related:
  - architecture/rendering
  - web-platform/cdn
  - architecture/application-boundaries
  - data/database-types
  - architecture/scaling
  - architecture/background-jobs
officialDocs:
  - title: The Twelve-Factor App
    url: https://12factor.net/
  - title: AWS Lambda — Execution environment lifecycle
    url: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
  - title: Vercel — Functions
    url: https://vercel.com/docs/functions
  - title: Docker — Docker overview
    url: https://docs.docker.com/get-started/docker-overview/
  - title: Martin Fowler — Continuous Delivery
    url: https://martinfowler.com/bliki/ContinuousDelivery.html
  - title: Martin Fowler — Blue-green deployment
    url: https://martinfowler.com/bliki/BlueGreenDeployment.html
  - title: Martin Fowler — Canary release
    url: https://martinfowler.com/bliki/CanaryRelease.html
---

## What problem it solves

After the build you have static files and, often, server code. They must run somewhere: answer requests, grow with traffic, survive crashes and get updated without breaking users.

The **deployment model** decides:

- what you pay when nobody is using the app;
- how fast a new instance (a running copy of your app) starts, and how long one request may run;
- where state can live, and what is lost on a restart;
- what "deploy" and "roll back" mean.

Frontend developers meet this every day: hosting platforms such as Vercel and Netlify quietly turn framework features (server rendering, regeneration, server functions) into one of the models below.

## Mental model: the build output decides the runtime

```
source ──build──► static files ─────────────► object storage + CDN       (no server)
              └──► server code ──┬──► long-running process (VM or container)
                                 ├──► functions (started on demand, scale to zero)
                                 └──► edge functions (in every CDN location)
```

Two moments matter:

- **Build time** runs once per deploy: compiling, bundling, prerendering pages.
- **Request time** runs on every visit: server rendering, API handlers, server functions.

[Rendering strategies](/architecture/rendering/) decide how much work happens at build time and how much at request time. The deployment model decides **where** the request-time code runs.

A deploy is usually two things: an **immutable artifact** (the build output or a [container image](/delivery/containers/), never changed after it is built) and **configuration** (environment variables, secrets). The Twelve-Factor App calls this separating config from code: the same artifact goes through staging and production, and only the configuration differs.

One catch for frontends: configuration that ends up in the browser bundle is read at **build** time. A `NEXT_PUBLIC_` or `VITE_` variable is copied into the JavaScript, and changing it later on the server changes nothing. To promote one artifact through environments, load such values at runtime (for example from a small config endpoint, or a script the server injects into the page), or accept a separate build per environment.

## Deployment models

| Model | What runs | Scaling | Cost when idle | Main limits | Good for |
| --- | --- | --- | --- | --- | --- |
| **Static hosting** | Files on a [CDN](/web-platform/cdn/) (servers near users that keep copies) | Practically unlimited | Almost zero | No code at request time (unless combined with functions) | Docs, blogs, marketing sites, SPAs that call external APIs |
| **Long-running servers** (VMs: virtual machines; containers; PaaS: platforms that run your app for you) | A process that stays up and handles many requests | Add instances; [autoscaling](/architecture/scaling/#autoscaling) reacts in seconds to minutes | You pay for at least one instance all the time | You plan capacity; you run more of the system | Steady traffic, [WebSockets](/architecture/real-time/), long requests, [background workers](/architecture/background-jobs/) |
| **Serverless functions** | Code the platform starts on demand; instances are created and removed automatically | Automatic, fast, down to zero | Almost zero | Cold starts, a maximum duration, no persistent local disk, many database connections | Spiky traffic, server rendering on hosting platforms, webhooks |
| **Edge functions** | Lightweight isolates (small sandboxes inside one shared runtime) in every CDN location | Automatic | Almost zero | Limited APIs, short CPU time, usually far from the data ([edge compute](/web-platform/cdn/#edge-compute-where-should-code-run)) | Redirects, token checks, A/B routing, light personalization |

Some details behind the table:

- A **cold start** is the delay when the platform has to create a new instance: load the runtime and your code before the first request. It ranges from milliseconds (edge isolates) to a second or more (large functions in slow runtimes). Warm instances are reused for later requests.
- The **maximum duration** of a function depends on the provider, the trigger and the plan: AWS Lambda stops an invocation after 15 minutes, other platforms allow an hour or more, and an HTTP response often has a shorter limit of its own. Long work that a user would wait for belongs in a [background job](/architecture/background-jobs/) either way.
- **Serverless containers** sit in between: you ship a container image, and the platform starts and stops instances by traffic, down to zero (Google Cloud Run, Azure Container Apps).
- Platforms blur the lines: some let one function instance handle several requests at once, and a full-stack framework app on Vercel or Netlify becomes a mix of static files, functions and edge functions.

## Containers, briefly

A **container** packages the app with its dependencies and system libraries into an **image** that runs the same way on a laptop, in [CI](/delivery/ci-cd/) and in production, as long as the host has a compatible operating system kernel and CPU architecture (images can be built for several architectures, such as x86 and ARM). It is lighter than a virtual machine because containers share the host's operating system kernel. Docker is the common tool to build and run images.

Running many containers on many machines needs an **orchestrator**: it decides where each container runs, restarts crashed ones, scales them, rolls out new versions and routes traffic between services. **[Kubernetes](/delivery/kubernetes/)** is the dominant one. It is powerful and complex: a platform for building platforms. It pays off when an organization runs many services and has people to operate it; a small team usually does better with a managed platform.

## State: what survives a restart

The key rule: **treat every instance as disposable.** Any instance can be stopped, restarted or replaced during a deploy, a scale-down or a crash. Its memory is lost on any restart. Its local disk may survive a simple restart but not a replacement, and it is never shared with other instances. Only an attached persistent volume or an external service keeps data, according to its own storage rules.

| State | Wrong place | Right place |
| --- | --- | --- |
| Uploaded files | The server's local disk | Object storage (a service for files, such as S3 or R2) |
| User sessions | Process memory (users are logged out when they hit another instance) | A database, Redis, or a signed cookie ([sessions](/security/auth/#sessions-in-practice-the-lifecycle)) |
| Cache | Only in-process, when all instances should see the same cached value | In-process is fine as a per-instance speedup; a shared cache when instances should share entries, with a clear freshness and invalidation plan ([caching](/architecture/caching/)). Data that must be correct belongs in the database ([consistency](/data/consistency/)) |
| Scheduled and long-running work | `setTimeout` or a timer in the web process | A [job queue](/architecture/background-jobs/) or a scheduler service |
| WebSocket connections | A function runtime that doesn't support long-lived connections (check the platform's limits) | Long-running servers, a managed [real-time](/architecture/real-time/) service, or a serverless runtime built for connections (such as Cloudflare Durable Objects) |
| A SQLite database file | The ephemeral disk of a function or container | A database service, or a platform that offers persistent volumes |

## Releasing: from commit to users

**[CI/CD](/delivery/ci-cd/)** is the automated path from a commit to production:

- **CI** (continuous integration): every change is built and tested automatically, and merged often.
- **CD** means either **continuous delivery** (every change *can* go to production; a person presses the button) or **continuous deployment** (every change that passes the checks goes to production automatically).

A typical pipeline: build → test → package the artifact → deploy to staging → deploy to production. GitHub Actions, GitLab CI, Jenkins and Bamboo are the engines that run such pipelines.

How a new version reaches users:

| Strategy | How it works | Rollback |
| --- | --- | --- |
| **Recreate** | Stop the old version, start the new one | Slow; there is downtime |
| **Rolling** | Replace instances a few at a time | Roll forward or back gradually |
| **Blue-green** | Run the new version next to the old one, then switch all traffic at once | Instant for code: switch back |
| **Canary** | Send a small share of traffic to the new version, watch error rates and latency ([monitoring](/observability/logs-metrics-traces/)), then increase | Stop the canary |
| **Feature flags** | Deploy the code switched off, then turn it on for chosen users | Turn the flag off, no deploy; what the feature already did stays |

A rollback switches **code**, not **data**. Database changes, sent messages and charged cards stay. Keep the schema and data compatible with the previous version for as long as you might roll back.

Whatever the strategy, two rules prevent errors during a rollout:

- send traffic to a new instance only when it reports that it is **ready** (a readiness check);
- **drain** an old instance before stopping it: stop sending it new requests, let current requests finish within a time limit, and expect long-lived connections to reconnect.

Frontend platforms add two habits that are worth copying anywhere:

- **Immutable deploys with their own URLs.** Each deploy is kept exactly as it was built, under its own URL, for as long as the platform's retention policy keeps it. A rollback points the domain back to an older deploy. That works if the deploy is still retained and its configuration and data are still compatible.
- **Preview deployments.** Every pull request gets its own live URL for review. Keep them out of search engines ([noindex](/web-platform/site-files/#noindex-what-search-engines-may-show)).

Two problems are specific to releasing web apps:

- **Version skew.** After a deploy, users with open tabs still run the old JavaScript. It calls the new server, or asks for old code chunks that were deleted, which fails with errors like `ChunkLoadError`. Keep old assets available for a while, keep APIs backward compatible ([API evolution](/architecture/api-styles/#evolution-the-long-term-cost)), and reload the page when a chunk fails to load. Some platforms route old clients to the old deployment (Vercel calls this skew protection).
- **Database migrations.** During a rolling deploy, old and new code run at the same time against the same database. Change the schema in compatible steps (expand, migrate, then contract) so both versions work.

## Typical failures

- **Files or sessions on the instance.** It works locally and breaks with two instances or after the first deploy.
- **Long work in a function** (video processing, big exports) that hits the time limit.
- **Database connections exhausted** by many function instances ([scaling the database](/data/database-types/#scaling-briefly)).
- **Secrets in the client bundle.** Environment variables with a public prefix (`NEXT_PUBLIC_`, `VITE_`) are copied into the JavaScript, and anyone can read them.
- **Configuration baked into the build without meaning to**: staging and production then run different artifacts, and testing on staging proves less.
- **Old static assets deleted on deploy**, breaking every open tab.
- **Functions in one region, the database in another.** Every query crosses an ocean.
- **Cold starts on a latency-critical path**, made worse by large function bundles.
- **Surprise bills.** Functions are cheap for low or spiky traffic and can be expensive for high, steady traffic; bandwidth is billed too.
- **No rollback plan**, or a migration that can't be reversed.

## How to choose

Ask:

1. What is the traffic shape: spiky or steady, small or large?
2. What is the longest request? Does anything keep a connection open?
3. Where is the data, and can the code run near it?
4. Who will operate it, and how much control is needed?
5. What does it cost at the expected volume, not only at zero?

Rules of thumb:

- **Content sites, docs, SPAs with an external API:** static hosting on a CDN.
- **A full-stack framework app with moderate or spiky traffic:** a platform that maps it to static files and functions, or a single container service if you want more control.
- **Steady high traffic, WebSockets, long requests, background workers:** long-running containers.
- **Latency-sensitive logic that needs no data:** edge functions.
- **Many services and a platform team:** container orchestration, such as managed Kubernetes.

## Landscape

- **Static and frontend platforms:** Vercel, Netlify, Cloudflare Pages, GitHub Pages, AWS Amplify, Amazon S3 with CloudFront.
- **App platforms (PaaS) and serverless containers:** Render, Railway, Fly.io, Heroku, Google Cloud Run, Azure Container Apps.
- **Functions:** AWS Lambda, Vercel Functions, Netlify Functions, Azure Functions, Google Cloud Run functions. Edge: Cloudflare Workers, Deno Deploy, Vercel and Netlify edge functions.
- **Containers and orchestration:** Docker, Podman; Kubernetes (managed as EKS, GKE, AKS), Amazon ECS, HashiCorp Nomad.
- **CI/CD:** GitHub Actions, GitLab CI/CD, Jenkins, Atlassian Bamboo, CircleCI, Buildkite; GitOps deploy tools Argo CD and Flux.
- **Infrastructure as code** (servers and services described in files, created by a tool): Terraform and OpenTofu, Pulumi, AWS CDK, SST.
- **Feature flags:** LaunchDarkly, Unleash, Flagsmith, GrowthBook, Statsig.
