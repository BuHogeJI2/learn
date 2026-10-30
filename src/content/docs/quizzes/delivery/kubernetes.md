---
title: Kubernetes — check yourself
description: Scenario questions about rollouts, probes, scheduling, storage and how traffic reaches Pods.
quizFor: delivery/kubernetes
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. A few seconds of errors on every deploy

Each [rolling update](/delivery/deployment-models/#releasing-from-commit-to-users) (replacing Pods, the running copies of the app, a few at a time) of a web service causes a short burst of `502` errors. The Deployment (the object that keeps N identical Pods running) has no probes configured, and the app takes about 10 seconds to start. What is going on?

<details>
<summary>Answer</summary>

Two gaps, one at each end of the rollout:

- **Start**: without a **readiness probe** (a check that tells Kubernetes the Pod can take traffic), a new Pod counts as ready as soon as its container starts, so it receives requests during its 10-second startup and fails them.
- **Stop**: old Pods are removed from the Service and get `SIGTERM` at about the same time. If the app exits at once, or doesn't handle `SIGTERM` at all and is killed later, requests that were still arriving or in flight fail.

Add a readiness probe; handle `SIGTERM` by finishing current requests within the grace period ([shutdown](/delivery/containers/#configuration-secrets-and-data)), often with a short pre-stop delay so routing changes have time to spread. Don't add a liveness probe (a check that restarts a stuck container) that checks shared dependencies such as the database: it restarts healthy Pods during a database blip.

</details>

## 2. New Pods stuck in `Pending`

After raising the memory **request** (the amount the scheduler reserves for a Pod when placing it) of a service from 256 MiB to 4 GiB "to be safe", new Pods stay `Pending` and the rollout doesn't finish. Each node has 8 GiB allocatable; other Pods already request 6 GiB on each node, but actually use only about 3 GiB. The Pod events say `Insufficient memory`. Why?

<details>
<summary>Answer</summary>

The **scheduler** places a Pod only on a node that has enough unrequested capacity for the Pod's **requests**, not for what it actually uses. Each node has only 2 GiB of unrequested memory left, so a Pod requesting 4 GiB fits nowhere, even though 5 GiB of physical memory sits unused.

Set requests from **measured** usage (plus some headroom), and limits (the maximum a container may use at runtime) to protect the node. If more capacity is really needed, a cluster autoscaler can add nodes, at a cost. Oversized requests waste money even when they fit: they block other Pods from being scheduled and make the cluster add nodes, while the memory itself stays idle (running containers can still use spare memory above their request, up to their limit).

</details>

## 3. "Kubernetes will roll it back"

A release has a bug in its startup configuration: the new Pods crash on start. The team waits for Kubernetes to roll back to the previous version automatically. What actually happens, and what should they do?

<details>
<summary>Answer</summary>

The rolling update **stalls**: the new Pods never become ready, so the old ones keep serving (if the update strategy keeps enough of them). After a deadline the Deployment is marked as failed, but Kubernetes **doesn't roll back on its own**. The cluster keeps trying to reach the desired state you declared, which is the broken version.

Rolling back is a decision: with [GitOps](/delivery/ci-cd/#landscape) (the cluster follows a Git repository), revert the change in Git, which restores every object declared there; `kubectl rollout undo` is the emergency option that restores only the Deployment's Pod template, and Git must then be fixed too, or the next sync brings the bug back. Neither undoes database changes. Automated rollback needs extra tooling (progressive delivery tools such as Argo Rollouts that watch metrics).

</details>

## 4. The database lost its data

A team runs PostgreSQL in a Deployment with one replica, storing data in the container's filesystem. After a node was replaced during maintenance, the database came back empty. What went wrong, and what would you do instead?

<details>
<summary>Answer</summary>

A Pod's own filesystem is **lost when the Pod is replaced**. The controller created a new Pod on another node, as designed, but the data stayed with the old one.

For data that must survive, use a **PersistentVolumeClaim** (a request for a disk that outlives the Pod), usually with a **StatefulSet** (an object that gives Pods stable names and their own disks), and check the reclaim policy (what happens to the disk when the claim is deleted) so deleting the claim doesn't delete the disk. Even then, a persistent volume is **not a [backup](/delivery/disaster-recovery/#replication-is-not-a-backup)**. Running a database well also means backups, upgrades and failover, so many teams keep stateless apps in Kubernetes and use a managed database outside the cluster.

</details>

## 5. New Pods get no traffic

Service A calls service B over [gRPC](/architecture/api-styles/) (a remote procedure call protocol that runs over HTTP/2) through a Kubernetes Service (a stable name that spreads connections across Pods). Under load, B's [autoscaler](/architecture/scaling/#autoscaling) adds four new Pods, but they stay idle while the old Pods are overloaded. Why?

<details>
<summary>Answer</summary>

A Kubernetes **Service balances connections, not requests**. HTTP/2 keeps one long-lived connection and sends many requests over it, so service A's existing connections stay on the old Pods. New Pods get traffic only when new connections are opened.

Options: balance per request with a client-side load balancer in A (gRPC supports this), which needs the addresses of the individual Pods, for example from a headless Service (one that returns every Pod's address in [DNS](/web-platform/dns/) instead of one virtual address); or a [service mesh](/architecture/application-boundaries/#landscape) or proxy (Envoy, Istio, Linkerd) that spreads requests; or limit connection lifetime on B's side, so clients reconnect regularly and spread out. The same effect hits WebSockets and keep-alive connections after scaling up.

</details>
