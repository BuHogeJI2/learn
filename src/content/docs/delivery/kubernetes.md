---
title: Kubernetes
description: What a container orchestrator does, how Kubernetes keeps the desired state, which objects take part in a deploy and a request, where data lives, and when Kubernetes is worth its cost.
related:
  - delivery/containers
  - delivery/deployment-models
  - architecture/scaling
  - architecture/reliability
officialDocs:
  - title: Kubernetes — Overview
    url: https://kubernetes.io/docs/concepts/overview/
  - title: Kubernetes — Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
  - title: Kubernetes — Service
    url: https://kubernetes.io/docs/concepts/services-networking/service/
  - title: Kubernetes — Gateway API
    url: https://kubernetes.io/docs/concepts/services-networking/gateway/
  - title: Kubernetes — Liveness, readiness and startup probes
    url: https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
  - title: Kubernetes — Persistent volumes
    url: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
---

## What problem it solves

Running one [container](/delivery/containers/) is easy. Running hundreds of them on dozens of machines raises questions that scripts handle badly:

- Which machine should each container run on?
- What restarts a container that crashed, or replaces a machine that died?
- How do you roll out a new version without downtime, and roll back?
- How do services find each other when containers come and go?
- How do configuration and secrets reach them?

An **orchestrator** answers these. **Kubernetes** (often written K8s) is the dominant one: open source, run by every major cloud as a managed service, with a huge ecosystem of tools.

## Mental model: desired state and control loops

You don't tell Kubernetes "start three containers". You **declare** "I want three copies of this image running", and Kubernetes keeps reality matching that declaration, forever.

```
you ── kubectl apply / GitOps ──► API server ──► desired state stored (etcd)
                                       ▲
     controllers watch it ─────────────┘  compare desired with actual → act
     scheduler: chooses a node for each new Pod
     kubelet (on every node): starts and watches the containers
```

- A **cluster** is a **control plane** (the API server, its database etcd, the scheduler and controllers) plus **nodes**, the worker machines that run containers.
- Everything is an **object** in the API, usually written as YAML manifests. Tools such as `kubectl`, Helm and Argo CD only create and update objects.
- **Controllers** run endless loops: compare what is declared with what exists, and fix the difference. If a node dies, the Pods that a controller manages (such as a Deployment's) are recreated on other nodes, once the failure is detected, if there is free capacity and the storage they need can be reached. Replacing the machine itself is a job for the cloud provider or a node autoscaler. This loop is called **reconciliation**.

## Following one deploy

1. You change the image version in a **Deployment** (an object that says "N identical copies of this Pod template").
2. The Deployment controller starts a **[rolling update](/delivery/deployment-models/#releasing-from-commit-to-users)**: it creates new **Pods** (the smallest unit: one or more containers sharing a network address) and removes old ones step by step.
3. The **scheduler** places each new Pod on a node that has enough of the CPU and memory the Pod **requests**.
4. The Pod gets its configuration from **ConfigMaps** and sensitive values from **Secrets**, as environment variables or files.
5. In a web service with a **readiness probe** configured, a new Pod receives traffic only after the probe succeeds. A **liveness probe** restarts a container that is stuck, so use it only for failures that a restart fixes; a **startup probe** holds off liveness checks while a slow app starts ([health checks](/architecture/reliability/#typical-failures)).
6. Old Pods are taken out of the traffic rotation and get `SIGTERM` at about the same time. Routing changes need a moment to spread, so requests can still arrive just after the signal. The grace period (30 seconds by default, including any pre-stop hook) is the total time to finish work before the Pod is killed ([shutdown](/delivery/containers/#configuration-secrets-and-data)).

If new Pods never become ready, the rollout stalls: Kubernetes keeps trying and, after a deadline, marks the Deployment as failed, but it doesn't roll back by itself. Rolling back is a decision. With [GitOps](/delivery/ci-cd/#landscape) (the cluster follows a Git repository), revert the change in Git; `kubectl rollout undo` is the emergency option. `rollout undo` restores only the Deployment's Pod template; a Git revert also restores the other objects declared in the repository, such as a ConfigMap or a Service. Neither undoes database changes.

## Following one request

```
user ─► cloud load balancer ─► Ingress / Gateway ─► Service ─► one of the ready Pods
                               (host, path, TLS)    (stable name,
                                                     balances between Pods)
```

This is a conceptual route. These are configuration objects, implemented by controllers and the network, and an ingress controller often sends traffic straight to the Pods.

- **Pods are disposable.** A recreated Pod gets a new IP address, so normal clients use a Service name, not Pod addresses.
- A **Service** gives a group of Pods a stable DNS name and address and spreads new connections across the Pods that are ready. It balances connections, not individual HTTP requests: a keep-alive, HTTP/2 or WebSocket connection stays on one Pod.
- **Ingress**, and its newer, more expressive successor the **Gateway API**, route HTTP traffic from outside the cluster to Services by host name and path, and terminate TLS. They need a controller that implements them (an NGINX- or Envoy-based one, or the cloud's [load balancer](/architecture/scaling/#load-balancing)).

## The rest of the everyday objects

| Object or setting | What it does |
| --- | --- |
| **Requests and limits** | A container's **requests** decide where it can be placed; its **limits** cap its use. Above the memory limit the container is killed; above the CPU limit it is slowed down. |
| **HorizontalPodAutoscaler** | Changes the number of Pods by a metric such as CPU ([autoscaling](/architecture/scaling/#autoscaling)). A cluster autoscaler adds or removes nodes to fit. |
| **Namespace** | Groups objects, for example per team or environment, with its own permissions and quotas. |
| **RBAC** (role-based access control) | Who may read or change which objects ([authorization](/security/auth/#authorization-checking-what-is-allowed)). |
| **Job** and **CronJob** | Work that runs to completion, once or on a schedule ([background jobs](/architecture/background-jobs/#scheduled-and-long-running-work)). |

## Storage: Pods are disposable, data is not

A Pod's own filesystem is lost when the Pod is replaced. Data that must survive uses a **PersistentVolumeClaim** (a request for storage), which Kubernetes binds to a **PersistentVolume**, usually a disk from the cloud provider. The volume survives Pod restarts and can follow the Pod to another node, within the limits of where that disk can be attached (often one availability zone; local disks can't move at all). Its storage class and **reclaim policy** decide what happens on cleanup: with the common `Delete` policy, deleting the claim also deletes the disk. A persistent volume is not a backup.

Running databases inside Kubernetes is possible (a **StatefulSet** gives Pods stable names and their own volumes), but it is serious operational work: backups, upgrades, failover. Many teams keep stateless apps in Kubernetes and use a managed database outside the cluster ([what survives a restart](/delivery/deployment-models/#state-what-survives-a-restart)).

## How much Kubernetes do you run yourself?

| Option | You run | Examples |
| --- | --- | --- |
| **Self-managed** | Everything: control plane, upgrades, etcd backups, nodes | kubeadm, on-premise distributions |
| **Managed control plane** | Nodes and everything inside the cluster | Amazon EKS, Google GKE, Azure AKS |
| **Managed nodes too** | Your workloads; you pay per Pod or the provider manages node pools | GKE Autopilot, EKS Auto Mode, AWS Fargate |
| **No Kubernetes** | Only your containers | Google Cloud Run, Amazon ECS on Fargate, Fly.io, Render (ECS on your own EC2 machines leaves the machines to you) |

On top of the cluster, teams describe and ship workloads with **Helm** (templated packages called charts), **Kustomize** (environment-specific overlays) and **GitOps** tools such as Argo CD and Flux, which keep the cluster in sync with a Git repository.

## Typical failures

- **Kubernetes for a small team with two services.** The operational cost is bigger than the benefit.
- **No resource requests or limits**: unpredictable placement, noisy neighbors, containers killed for memory.
- **No readiness probe**, so traffic reaches Pods that are still starting, and every deploy causes errors. Or a **liveness probe that checks the database**, so a short database problem restarts every Pod.
- **Ignoring `SIGTERM`**, so rollouts cut off requests in flight.
- **Secrets as plain manifests in Git.** Kubernetes Secrets are only base64-encoded, which is not encryption, so never commit their values. Combine least-privilege access with encryption at rest in the cluster. An external secret manager that syncs values into the cluster is a common addition, and the synced Secrets still need the same protection.
- **The `latest` image tag**: Pods run different versions, and rollback is unclear.
- **Data in the Pod's filesystem**, lost on the next reschedule.
- **Copy-pasted YAML** per environment that slowly drifts apart.
- **Postponed cluster upgrades.** Each Kubernetes minor version is supported for only about a year, so upgrades are routine work, not a rare project.
- **Everyone is cluster admin.**

## When to use it

- **Worth it:** many services and several teams; a platform team to run it; portability across clouds or on-premise; special scheduling needs (GPUs, large batch jobs); the ecosystem of tools.
- **Not worth it yet:** a handful of services and a small team. A managed container platform (Google Cloud Run, Amazon ECS, Fly.io, Render) or a frontend platform gives you most of the benefit. Because containers are portable, moving to Kubernetes later is realistic.
- **If you do adopt it:** use a managed service, deploy through GitOps, set requests and limits for every workload, readiness probes (plus liveness and startup probes where they fit) for every service that takes traffic, and keep databases managed outside the cluster unless you have strong reasons.

## Landscape

- **Managed Kubernetes:** Amazon EKS, Google GKE (including Autopilot), Azure AKS, DigitalOcean Kubernetes.
- **Distributions:** Red Hat OpenShift, Rancher (RKE2), k3s (lightweight), Talos Linux.
- **Local clusters:** kind, minikube, k3d, Docker Desktop, OrbStack.
- **Packaging and deploy:** Helm, Kustomize, Argo CD, Flux.
- **Networking:** Ingress controllers (Traefik, HAProxy, NGINX-based), Gateway API implementations (Envoy Gateway, Istio, Cilium), service meshes (Istio, Linkerd), network plugins (Cilium, Calico).
- **Scaling and operations:** Horizontal Pod Autoscaler, KEDA, Cluster Autoscaler, Karpenter; k9s and Lens for inspecting clusters; Backstage for developer portals on top.
