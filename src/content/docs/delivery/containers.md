---
title: Containers
description: What images and containers are, how isolation works, where containers sit next to VMs and serverless, and how to build images that are small, safe and reproducible.
related:
  - delivery/deployment-models
  - delivery/ci-cd
officialDocs:
  - title: Docker — Docker overview
    url: https://docs.docker.com/get-started/docker-overview/
  - title: Docker — Building best practices
    url: https://docs.docker.com/build/building/best-practices/
  - title: Docker — Multi-stage builds
    url: https://docs.docker.com/build/building/multi-stage/
  - title: Docker — Storage
    url: https://docs.docker.com/engine/storage/
  - title: Docker — Multi-platform builds
    url: https://docs.docker.com/build/building/multi-platform/
  - title: Open Container Initiative
    url: https://opencontainers.org/
---

## What problem it solves

An app depends on much more than its own code: a runtime version (Node.js 22), system libraries, environment settings. When any of them differs between a laptop, [CI](/delivery/ci-cd/) and production, you get "it works on my machine".

A **container** packages the app together with everything it needs to run, so the same package runs the same way on every compatible machine (the same operating system family and CPU architecture). It also lets many apps share one machine without getting in each other's way, and it starts in moments. Many [deployment models](/delivery/deployment-models/) are built on it: container platforms, orchestrators and even some serverless services run container images.

## Mental model: an image is a template, a container is a running copy

```
Dockerfile ──build──► image ──push──► registry ──pull──► container
(recipe)              (read-only       (stores          (image + a thin writable layer
                       layers)          images)           + a running process)
```

- **Image**: a read-only package made of **layers**. Each build step that changes files adds a layer: base system files, the runtime, dependencies, your code. Other instructions only set metadata, such as the start command. Layers are [cached](/architecture/caching/) and shared between images, so rebuilding after a code change reuses everything below it.
- **Tag and digest**: `myapp:1.4.2` is a **tag**, a name that can be moved to another image. `myapp@sha256:…` is a **digest**, which always means exactly one image.
- **Container**: a process started from an image, plus a thin writable layer. That layer disappears when the container is removed.
- **Registry**: a server that stores images (Docker Hub, GitHub Container Registry, Amazon ECR).
- **Isolation** (in the common case of Linux containers): a container is an ordinary process that the Linux kernel isolates. **Namespaces** give it its own view of processes, network and files; **cgroups** make it possible to limit its CPU and memory, but Docker sets no limits by default: set them yourself, or let the platform do it. All containers on a machine share the host's kernel. That makes them light, but their isolation is weaker than a virtual machine's. (To run Linux containers on macOS or Windows, Docker runs a small Linux virtual machine. Windows also has native Windows containers, a separate kind.)
- **OCI** (Open Container Initiative): the open standard for image and runtime formats, so images built with Docker run under Podman, containerd or a cloud platform.

## Containers among the other layers

Containers aren't an alternative to virtual machines or serverless; the layers stack:

```
hardware ─► virtual machine (own kernel) ─► containers (shared kernel) ─► your process
                                               ▲
                     often run for you by Kubernetes, Amazon ECS, Google Cloud Run…
```

| | Virtual machine | Container | Serverless function (managed runtime) | Isolate (a sandbox inside a shared runtime, as in edge functions) |
| --- | --- | --- | --- | --- |
| What you ship | A whole operating system | Your app and its user-space dependencies | Function code; the platform gives the runtime | Code; the runtime is shared |
| Start time | Tens of seconds to minutes | Milliseconds to seconds | Milliseconds to seconds ([cold start](/delivery/deployment-models/#deployment-models): a new instance must start first) | Milliseconds |
| Isolation | Strong: hardware virtualization | Process-level, shared kernel | Chosen by the provider (AWS Lambda uses Firecracker micro-VMs) | A sandbox inside the runtime |
| You maintain | OS patches and everything above | The image and its base image (and the host, if you run it) | Your code and dependencies, plus moving to new runtime versions | Your code and dependencies |

Real platforms combine them: your containers run inside cloud VMs; Google Cloud Run runs your container image as a serverless service; AWS Lambda also accepts container images as packages (then the runtime inside the image is yours to update); and **micro-VMs** (Firecracker) and sandboxes such as gVisor give container-like speed with stronger isolation.

## Building good images

- **Small base images** (`-slim`; distroless, which contain no shell or package manager; Alpine) mean fewer vulnerabilities and faster pulls. Alpine uses a different C library (musl), which breaks some native modules; a slim Debian image is often the safer choice.
- **Multi-stage builds**: build in a large image with compilers and dev dependencies, then copy only the result into a small runtime image.
- **Order layers for the cache**: copy the dependency files (`package.json` and the lockfile) and install dependencies first, then copy the source code. A code change then doesn't reinstall every dependency.
- **A `.dockerignore` file** with the right patterns keeps `node_modules`, `.git` and `.env` out of the build.
- **Don't run as root**, and make the filesystem read-only where you can.
- **Pin the base image version** (ideally by digest), and update the pins on purpose: a rebuild against the same digest keeps the same old base, vulnerabilities included. Let a tool such as Renovate or Dependabot propose new versions, then rebuild, test and redeploy. Scan images for known vulnerabilities.
- **One main process per container**, writing logs to standard output, where the platform collects them ([logs](/observability/logs-metrics-traces/)).
- **Build for the right CPU architecture.** An image built on an ARM laptop (Apple Silicon) may not run on x86 servers; multi-platform builds produce both.

## Configuration, secrets and data

- **One image for every environment.** Configuration arrives at start time, as environment variables or mounted files. Values baked in during the build, such as public variables in a frontend bundle, don't change this way ([build once](/delivery/ci-cd/#mental-model-a-commit-becomes-an-artifact-the-artifact-is-promoted)).
- **Secrets never go into image layers.** Anyone who can pull the image can read every layer, including files you deleted in a later layer. Inject secrets at runtime from a secret manager. If the build itself needs a secret (a token for a private package registry), pass it as a **build secret**, which is available only during that step and never stored in a layer, and don't print it in logs.
- **Data doesn't live in the container.** Its writable layer is lost when the container is replaced; keep data in **volumes** (storage attached from outside) or in external services such as a database or object storage ([what survives a restart](/delivery/deployment-models/#state-what-survives-a-restart)).
- **Health and shutdown.** The platform needs to know whether the process is alive and ready to receive traffic, so expose health checks. On `SIGTERM` (the signal to stop), stop taking new work and finish current requests within the grace period. Two traps: a shell script that starts the app may not pass `SIGTERM` on to it, and a Node.js process running as the container's first process (PID 1) doesn't get the usual default signal handling. Start the app directly, or make the script end with `exec node server.js` so Node replaces the shell; a small init process (`docker run --init`) helps as PID 1, but it passes signals to its direct child, so it doesn't fix a shell in between by itself. Still handle `SIGTERM` in the app so it finishes its requests.

For local development, **Docker Compose** describes the app, its database and Redis in one file and starts them with one command; **dev containers** give every developer the same toolchain.

## Typical failures

- **Huge images** (1–2 GB with compilers and dev dependencies): slow deploys and slow cold starts.
- **Secrets in layers** or in build arguments.
- **The `latest` tag in production**: you can't tell what is running, and rollback is unclear.
- **Running as root** on an old base image full of known vulnerabilities.
- **Data written inside the container**, lost when the container is replaced, which every deploy does. A local volume survives that, but not the loss of its machine: by itself it has no replication or backups.
- **Ignoring `SIGTERM`**, so every deploy cuts off requests in flight.
- **Memory limits that don't match the runtime.** When the process uses more memory than the limit, the kernel kills it (out of memory), and the container stops. The JavaScript heap is only part of a Node.js process's memory; buffers, native code and stacks come on top. Leave headroom between the heap setting and the limit, and measure the total.
- **Wrong CPU architecture**: the container fails at once with `exec format error`.
- **Treating a container like a server**: logging into it and fixing things by hand. Change the image and redeploy instead.

## When to use

- **Yes:** server apps on long-running platforms; many services with different runtimes; the same environment in CI, locally and in production; any platform that takes images ([Kubernetes](/delivery/kubernetes/), Amazon ECS, Google Cloud Run, Fly.io).
- **Often unnecessary:** static sites and frontend platforms such as Vercel or Netlify already package your app for you; a Dockerfile adds little there.
- **No Dockerfile needed:** buildpacks can turn source code into an image automatically for common languages.

## Landscape

- **Build and run:** Docker (Engine, Desktop, Buildx), Podman, containerd; buildpacks (Paketo), Railpack.
- **Registries:** Docker Hub, GitHub Container Registry, Amazon ECR, Google Artifact Registry, Azure Container Registry, Harbor.
- **Run in production:** Kubernetes, Amazon ECS, Google Cloud Run, Azure Container Apps, Fly.io, Render.
- **Security:** Trivy, Grype, Docker Scout, Snyk; distroless and Chainguard base images; Sigstore `cosign` for signing images.
- **Local development:** Docker Compose, Dev Containers, OrbStack, Colima.
