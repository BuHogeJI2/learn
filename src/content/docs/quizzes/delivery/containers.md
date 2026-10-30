---
title: Containers — check yourself
description: Scenario questions about image size, build caching, secrets, shutdown and memory limits.
quizFor: delivery/containers
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A 1.8 GB image

A Node.js API image is 1.8 GB. Deploys are slow, and every change to one line of code reinstalls all dependencies during the build. The Dockerfile starts from `node:22`, copies the whole repository, runs `npm install` and `npm run build`. What would you improve?

<details>
<summary>Answer</summary>

- **Order layers for the cache** (each build step that changes files adds a layer to the image): copy `package.json` and the lockfile first, install dependencies, then copy the source. A code change then reuses the dependency layer, because layers below the change are [cached](/architecture/caching/).
- **Multi-stage build**: build in a full image with dev dependencies, then copy only the built output and production dependencies into a small runtime image (`node:22-slim`, or distroless, which has no shell or package manager).
- **`.dockerignore`**: keep `node_modules`, `.git` and `.env` out of the build context (the files sent to the builder).
- Use `npm ci` so the build installs exactly what the lockfile says.

The trade-off of very small images: distroless has no shell for debugging, and Alpine's different C library (musl) breaks some native modules, so a slim Debian base is often the safer middle.

</details>

## 2. `exec format error`

A developer builds an image on an Apple Silicon laptop and pushes it. On the production servers, which run `linux/amd64` (x86), the container fails at once with `exec format error`. Locally it runs fine. Why?

<details>
<summary>Answer</summary>

The image was most likely built for the laptop's **CPU architecture** (ARM), and the servers are x86. (The same error can come from a broken executable or script, so compare the image's platform with the host's before you rebuild.) Containers share the host's kernel and run its instructions directly, so an image only runs on a matching architecture (unless the host emulates the other one, which is slow).

Build images in **[CI](/delivery/ci-cd/)** for the target platform, or as **multi-platform** images (Buildx, Docker's image-building tool, can produce ARM and x86 variants under one tag). Building in CI also gives a reproducible artifact instead of "whatever was on someone's laptop".

</details>

## 3. A deleted token that is still there

To install private packages, the Dockerfile copies `.npmrc` with a registry token, runs `npm ci`, and then deletes `.npmrc` in a later step. A security scan finds the token in the published image. How?

<details>
<summary>Answer</summary>

Each build step that changes files adds a **layer**, and the image keeps every layer. Deleting the file in a later layer only hides it; the earlier layer still contains it, and anyone who can pull the image from the registry (the server that stores images) can read it.

Pass the token as a **build secret**: it is available only during that one step and never stored in a layer. Then rotate the leaked token, because it was already published. More generally, secrets never go into image layers or build arguments; runtime secrets are injected when the container starts.

</details>

## 4. Every deploy cuts off requests

During each deploy, some users get connection errors in the middle of their requests. The container starts with `CMD ["sh", "start.sh"]`, and the script runs `node server.js`. The platform sends `SIGTERM` (the signal asking a process to stop) and waits 30 seconds before killing the container. What is wrong?

<details>
<summary>Answer</summary>

The shell script is the container's main process, and a script started this way usually doesn't pass `SIGTERM` on to the Node.js process. Node never learns that it should stop, keeps working until the platform kills it after 30 seconds, and the requests in flight are cut off.

Start the app **directly** (`CMD ["node", "server.js"]`), or end the script with `exec node server.js` so Node replaces the shell. A small init process (`--init`) is useful as PID 1, but it passes signals to its direct child, so on its own it would still send them to the shell. In the app, **handle `SIGTERM`**: stop accepting new requests, finish current ones within the grace period, then exit. Together with a [readiness check](/delivery/kubernetes/#following-one-deploy), the platform stops sending traffic before the process goes away.

</details>

## 5. Killed with memory to spare

A Node.js container has a 512 MB memory limit, and the team set the JavaScript heap (the memory for JavaScript objects) limit to 512 MB to "use all of it". Under load the container is killed with "OOMKilled", although heap metrics never show more than 450 MB. Why?

<details>
<summary>Answer</summary>

The **heap is only part** of a Node.js process's memory. Buffers, native code, thread stacks and the runtime itself come on top. The kernel counts the whole process against the container limit, and kills it when the total crosses 512 MB, whatever the heap metrics say.

Leave **headroom**: set the heap limit clearly below the container limit (for example around 75%), measure the total memory of the process under load, and size the limit from that. Note that Docker sets no memory limit by default; on a platform with a limit, killing is the expected outcome when it is crossed.

</details>
