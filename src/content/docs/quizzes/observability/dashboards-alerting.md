---
title: Dashboards and alerting — check yourself
description: Scenario questions about alert routing, missing data, dashboards and incident response.
quizFor: observability/dashboards-alerting
---

Think about each scenario before you open the answer. There is rarely one correct option. A good answer names the trade-off.

## 1. Fifty pages for one problem

The shared database goes down for ten minutes. The on-call engineer's phone receives about fifty pages: one alert instance (one rule can fire separately for each server or service it watches) for every service and every server that depends on the database. Finding the real cause in this flood takes time. What would you change in the alerting setup?

<details>
<summary>Answer</summary>

- **Group notifications** by `service` and `team` instead of by instance, so fifty failing servers become one notification per service, with updates on a timer.
- **Inhibition**: while the database alert fires, suppress the alerts of the services that depend on it. Scope it to that dependency only, or one database alert can hide unrelated failures.
- Make sure the **source** has its own symptom-based alert with a runbook (the steps to diagnose and fix), so the first message already points at the database.

Suppression changes notifications, not evaluation: the rules still run, and the dashboards still show every failing service.

</details>

## 2. The alert that resolved itself

An alert fires when the error rate is above 2% for 5 minutes. During an outage in one region, the alert for that region **resolved**, and the team relaxed. Later they found that the region had simply stopped sending [metrics](/observability/logs-metrics-traces/), so its time series (the stream of values for one metric and label set) had disappeared. How did that happen?

<details>
<summary>Answer</summary>

When a series **disappears**, a threshold rule has nothing to compare, so the alert for it can resolve: no data looks like no problem. An empty result, a failed query and one missing series (one region stops reporting) are different cases, and each rule needs a decision about them.

Configure what "no data" and "error" mean for the rule (for an important signal, treat them as alerting), and add explicit **absence or heartbeat checks** (heartbeat: a regular "I'm alive" signal) for signals that must always exist. Don't page for instances that disappear through normal scale-down, so filter those cases on purpose.

</details>

## 3. Monitoring went down with the site

A full outage of the [Kubernetes](/delivery/kubernetes/) cluster also took down Prometheus (which stores metrics and evaluates alert rules), Grafana (dashboards) and Alertmanager (which routes alerts to people), all running in the same cluster. Nobody was paged; customers reported it first. What was missing?

<details>
<summary>Answer</summary>

Monitoring that runs on the **same infrastructure** it watches fails together with it. Nothing was left to notice the outage and send the page.

Add at least one **external check**: a synthetic or uptime check (a scripted request from outside your network on a schedule) that pages through a separate service. Many teams also run the alerting path (or a hosted monitoring service) outside the main cluster, and use a "dead man's switch": an alert that always fires, so that its **absence** at the paging service means monitoring itself is broken.

</details>

## 4. An hour to find the root cause

At 14:00 checkout error rates jump to 20%. A deploy happened at 13:52. The on-call engineer spends an hour reading logs to understand which change in the deploy broke checkout, while customers keep failing. In the postmortem, a manager asks who merged the bad change. What would you do differently, both during and after the incident?

<details>
<summary>Answer</summary>

**During**: mitigate first, find the root cause later. A deploy right before the jump is the first suspect: roll it back ([releasing](/delivery/deployment-models/#releasing-from-commit-to-users)) or turn off its feature flag (a switch that turns code on or off without a deploy), check that the metrics recover, and investigate calmly afterwards. For anything bigger than a blip, assign roles: an incident commander who coordinates, someone who communicates (internal channel, status page), and responders.

**After**: a **blameless postmortem**: the timeline, what contributed (why tests and the rollout didn't catch it, why there was no automatic rollback on error rate), what worked, and action items with owners. Asking who merged the change teaches people to hide details next time, and the system that let the bug through stays the same.

</details>

## 5. Sixty panels nobody can read

The service dashboard has sixty panels in no particular order, with average latency, no units and several near-copies for each region. During incidents, on-call engineers open it and then go straight to the logs. How would you rebuild it?

<details>
<summary>Answer</summary>

Start from the **audience and the question**: this dashboard is for the person on call. Lay it out from **symptom to cause**, top to bottom:

1. *Is it OK?* Request rate, error rate and latency percentiles (not averages), or the [SLO](/observability/logs-metrics-traces/#sli-slo-sla-and-error-budgets) status (the service's reliability target).
2. *Where?* The same numbers split by endpoint, region and version.
3. *Why?* Saturation, meaning how close resources are to full (CPU, memory, connection pools, queue depth), and the health of dependencies.

Add units and thresholds, **deploy annotations** (markers on the time axis showing each release), a **variable** for region instead of copies, and links onward to example traces, logs and the [error tracker](/observability/error-tracking/). Keep it as code in Git, so it is reviewed and doesn't drift into another sixty-panel copy.

</details>
