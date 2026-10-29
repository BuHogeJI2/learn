---
title: Dashboards and alerting
description: Turning telemetry into action — dashboards that answer questions, alert rules and routing, on-call and the incident flow — with Grafana as the main example.
related:
  - observability/logs-metrics-traces
  - observability/opentelemetry
  - architecture/reliability
officialDocs:
  - title: Grafana — Dashboards
    url: https://grafana.com/docs/grafana/latest/dashboards/
  - title: Grafana — Dashboard best practices
    url: https://grafana.com/docs/grafana/latest/dashboards/build-dashboards/best-practices/
  - title: Grafana — Alerting
    url: https://grafana.com/docs/grafana/latest/alerting/
  - title: Prometheus — Alertmanager
    url: https://prometheus.io/docs/alerting/latest/alertmanager/
  - title: Google SRE book — Managing incidents
    url: https://sre.google/sre-book/managing-incidents/
  - title: Google SRE book — Postmortem culture
    url: https://sre.google/sre-book/postmortem-culture/
---

## What problem it solves

Collected telemetry is useless if nobody looks at it, or if looking takes too long while users are affected. Three things turn data into action:

- **dashboards** show what is happening now and since when;
- **alerts** tell a person *when* to look;
- an **incident process** turns that alert into a fix and makes sure it doesn't happen the same way again.

Which signals to collect, and how SLOs (reliability targets) and error budgets (the amount of failure an SLO allows) work, is covered in [Logs, metrics and traces](/observability/logs-metrics-traces/#sli-slo-sla-and-error-budgets). This page is about using them.

## Mental model: from data to a person

```
data sources: metrics, logs, traces (Prometheus, Loki, Tempo, SQL, cloud metrics)
      │ queries
      ├──► dashboards ───── a person looks when curious or investigating
      │
      └──► alert rules ─── evaluated every minute or so
                │ firing
                ▼
           routing by labels ──► contact point (pager, chat, email) ──► on-call person
                ▲
        silences, grouping, mute timings
```

Tools such as **Grafana** sit on top of the data: they query data sources and draw dashboards. Alert rules are evaluated on a server, either by Grafana (for data sources that support alerting, not for every panel) or by the data source itself, as Prometheus does; a notification system such as Prometheus Alertmanager then groups and routes the resulting alerts. The telemetry itself lives in the storage systems behind them.

## Dashboards that answer questions

- **Start from the audience and the question.** A service overview for the person on call, a business view for the product team, a deep-dive for the engineers who own the service. One dashboard can't serve all of them.
- **Lay it out from symptom to cause**, top to bottom:
  1. *Is it OK?* Request rate, error rate and latency percentiles, or the SLO status.
  2. *Where?* The same numbers split by endpoint, region or version.
  3. *Why?* Saturation: CPU, memory, connection pools, queue depth, and the health of dependencies.
- **RED for services, USE for resources**: Rate, Errors, Duration for things that handle requests; Utilization, Saturation, Errors for CPUs, disks and pools ([what to measure](/observability/logs-metrics-traces/#what-to-measure)).
- **Mark [deploys](/delivery/deployment-models/#releasing-from-commit-to-users)** on the graphs (annotations). "The error rate jumped right after 14:02" is the first clue in most incidents.
- **Use variables** (dropdowns for service, environment, region) instead of copying a dashboard for each.
- **Link onward**: from a spike to example traces, from a trace to its logs, from an error rate to the issues in the [error tracker](/observability/error-tracking/).
- **Keep dashboards as code**: stored in Git, reviewed and reproducible, instead of hand-edited copies.

## Alerting: rules, routing, silences

An **alert rule** is a query plus a condition plus a duration: "error rate above 2% **for** 5 minutes". Three clocks are involved: the query's measurement window (the error rate over, say, the last 5 minutes), how often the rule is evaluated (every minute or so), and the **pending period** (how long the condition must hold before the alert fires). The pending period filters out short spikes; an alert that keeps firing and resolving needs a separate recovery threshold or a keep-firing period. Labels (key-value tags) on the rule (`team`, `service`, `severity`) decide where it goes; annotations carry the summary and links to the runbook (step-by-step instructions for this alert) and the dashboard.

- **Alert on symptoms**, ideally on SLO burn rate ([alerts that people act on](/observability/logs-metrics-traces/#alerts-that-people-act-on)). Arbitrary thresholds on causes such as "CPU above 80%" belong on dashboards. A cause that predicts real damage and needs action, such as a disk that will be full in four hours, is worth an alert, with urgency based on the time left.
- **Severity decides the channel**:
  - **page**: urgent and user-facing, wakes someone up;
  - **ticket**: needs work, but during working hours;
  - **info**: recorded, no notification.
- **Routing**: a tree of rules matches labels and sends each alert to a **contact point**: a pager service, a chat channel, email or a webhook.
- **Grouping**: one rule can produce many **alert instances**, one per server or region. Grouping notifications by `service` and `team`, not by instance, turns fifty failing servers into one notification. Timers then decide when the first message goes out, how often updates follow and when it repeats, so a long incident still sends more than one message.
- **Suppression affects notifications, not evaluation**: the rules still run, and alerts can still be firing. A **silence** mutes alerts that match given labels for a fixed time window (planned work); a **mute timing** is a recurring schedule (no ticket notifications at night); **inhibition** suppresses dependent alerts while a source alert fires, for example no page for every service of a cluster while that cluster's database is down. Scope inhibition to the shared dependency, or one database alert hides unrelated failures.
- **Handle missing data on purpose.** An empty result, a failed query and one series that disappears (one region stops reporting) are different cases, and a threshold rule doesn't notice the last one by itself; an alert can even resolve because its data vanished. Decide what "no data" and "error" mean for each rule, and add explicit absence or heartbeat checks for signals that must always exist. Don't page when an instance disappears through normal scale-down.
- **Watch the watchers.** Monitoring that runs on the same infrastructure it watches goes down with it. Add an external uptime check from outside your network.

## On-call and incident response

**On-call** is a rotation of people who respond to pages, with a schedule, **escalation** (if the first person doesn't acknowledge within N minutes, the next one is paged), handoffs between shifts, and a fair load.

When a page arrives, a typical **incident flow**:

1. **Detect**: an alert, a synthetic check (a scripted request that tests the site from outside on a schedule) or a user report.
2. **Acknowledge and assess**: how many users, how bad? This sets the severity.
3. **Assign roles** for anything bigger than a small blip: an **incident commander** who coordinates, someone who communicates, and responders who investigate.
4. **Mitigate first, find the root cause later**: roll back the [deploy](/delivery/deployment-models/#releasing-from-commit-to-users), turn off a feature flag, scale up, fail over to another region.
5. **Communicate**: an incident channel inside the company and updates on a status page for customers.
6. **Resolve and verify** that the metrics are back to normal.
7. **Review afterwards** in a **blameless postmortem**: the timeline, what contributed, what worked, and action items with owners. "Blameless" means looking at how the system and process allowed the mistake, not who made it; otherwise people stop sharing what really happened.

A **runbook** for each alert lists how to check the situation and the first steps to mitigate it. It turns a 3 a.m. page into a procedure instead of an investigation from zero.

## Grafana as a worked example

- **Data sources**: Grafana usually stores no telemetry itself (it keeps only its own configuration, dashboards and users in a database); it queries sources such as Prometheus or Mimir (metrics), Loki (logs), Tempo (traces), Pyroscope (profiles), and many others (PostgreSQL, Elasticsearch, CloudWatch, BigQuery).
- **Dashboards** are made of **panels** (time series, stat, table, heatmap, logs, traces), with **variables** and **annotations**. **Explore** is the view for ad-hoc queries and for jumping between metrics, logs and traces.
- **Grafana Alerting**: alert rules (queries, conditions, pending period, labels), **contact points**, **notification policies** (the label-based routing tree), silences and mute timings. Teams that use Prometheus often let Prometheus evaluate the rules and Alertmanager group and route the alerts.
- **As code**: dashboards are JSON models that can be provisioned from files or managed with Terraform.
- **Grafana Cloud** hosts the whole stack and adds on-call and incident tools, for teams that don't want to run it themselves.

## Typical failures

- **Alert fatigue**: many pages that need no action, so the real one gets missed.
- **Alerts without an owner, a runbook or a dashboard link.**
- **Only cause-based alerts** (CPU, disk) and none on what users feel; users notice the outage first.
- **Paging for things that can wait** until the morning.
- **Dashboards only their author understands**: no units, no thresholds, average latency only, sixty panels.
- **Dashboard sprawl**: hundreds of near-copies nobody maintains.
- **Monitoring on the same infrastructure** as the thing it monitors.
- **No alert when data stops arriving.**
- **Silences that are too broad, or renewed again and again.**
- **Postmortems that blame people**, after which nobody tells the whole story again.

## How to choose

- **Every production service:** one service overview dashboard, a few symptom-based alerts with runbooks, and an on-call arrangement, even if it is only "working hours plus best effort".
- **Tools:** if you use an all-in-one platform (Datadog, New Relic), use its dashboards and alerting. If you assemble open-source pieces (Prometheus, Loki, Tempo), Grafana is the usual front end; Grafana Cloud if you don't want to operate it.
- **Small teams:** alerts to a chat channel, a phone pager for the critical few, a status page for customers, and a short postmortem habit.

## Landscape

- **Dashboards:** Grafana, Kibana (Elastic), Datadog, New Relic, Honeycomb; Perses (open-source dashboards as code).
- **Alert routing:** Grafana Alerting, Prometheus Alertmanager, the monitors of commercial platforms.
- **On-call and incidents:** PagerDuty, incident.io, Rootly, FireHydrant, Grafana Cloud's on-call and incident tools.
- **Status pages:** Atlassian Statuspage, Better Stack, Instatus.
- **Synthetic and uptime checks:** Checkly, Better Stack Uptime, Pingdom, Grafana Synthetic Monitoring.
