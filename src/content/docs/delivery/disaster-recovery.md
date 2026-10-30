---
title: Disaster recovery
description: How to get a system and its data back after a real loss — backups versus replication, RPO and RTO, recovery strategies, restore drills and who is responsible for what.
related:
  - architecture/reliability
  - data/schema-evolution
  - delivery/kubernetes
  - observability/dashboards-alerting
officialDocs:
  - title: AWS — Disaster recovery options in the cloud
    url: https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html
  - title: Google Cloud — Disaster recovery planning guide
    url: https://cloud.google.com/architecture/dr-scenarios-planning-guide
  - title: PostgreSQL — Continuous archiving and point-in-time recovery
    url: https://www.postgresql.org/docs/current/continuous-archiving.html
  - title: Google SRE Book — Data integrity
    url: https://sre.google/sre-book/data-integrity/
  - title: GitLab — Postmortem of the database outage of January 31, 2017
    url: https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/
---

## What problem it solves

[Reliability patterns](/architecture/reliability/) keep a system running through ordinary failures: a slow dependency, a crashed instance. [Scaling](/architecture/scaling/) adds spare copies. Neither helps when the data itself is gone or wrong, or when the whole environment is:

- a migration or a bad script deletes a table;
- a bug writes wrong data for three days before anyone notices;
- ransomware or a stolen credential destroys production and everything reachable from it;
- a cloud region is down for hours;
- someone closes the wrong account, or a provider suspends it.

**Disaster recovery** (DR) is the plan and the practice for these cases. The difference from reliability: reliability prevents an outage, and DR assumes the outage has happened and asks how you come back, and how much you lose.

## Mental model: two numbers, one on each side of the disaster

```
        last good copy              disaster                 service back
  ───────────┬───────────────────────┬──────────────────────────┬─────────► time
             │◄──────── RPO ────────►│◄───────── RTO ──────────►│
             how much data you lose     how long you are down
```

- **RPO** (recovery point objective): how much recent data you can afford to lose, measured in time. An RPO of 5 minutes means losing up to the last 5 minutes of writes.
- **RTO** (recovery time objective): how long the service may be down before users can really use it again, including the time to check the data.

Both are **business decisions**, and each step toward zero costs a lot more than the last. Ask per system, not per company: checkout may need minutes, and a monthly report can wait a day. The numbers must also be honest: an RTO of one hour is meaningless if a restore takes six.

## Replication is not a backup

This is the central idea of the page.

| | Replication | Backup |
| --- | --- | --- |
| **Protects against** | A lost machine or a lost region | Deleted or corrupted data, attacks, bad deploys |
| **Keeps** | The current state, following the primary | Past points in time, for a while |
| **A bad update** | Is copied to every [replica](/data/consistency/#copies-and-consistency-models) (a live copy of the database), usually fast | Stays out of older backups |
| **Recovery** | Fast failover | Slower restore |

A [persistent volume](/delivery/kubernetes/#storage-pods-are-disposable-data-is-not), a mirrored disk and a multi-region database all share this limit: they hold only the current state, so a mistake leaves no good copy. You usually need both: replication for availability, and backups for history.

**Point-in-time recovery** (PITR) combines the two ideas. The database keeps a full backup plus a continuous log of changes, so you can restore to a chosen moment within the retained window, for example one minute before the bad migration ran. It restores the whole database to that moment, so valid writes made afterwards are lost unless you reconcile them. How much you really lose in a logical mistake depends on how quickly you **notice** it, and silent corruption can be older than your oldest backup. So keep backups long enough to cover how late you might discover a problem.

## What a backup must survive

The classic **3-2-1 rule**: three copies of the data, on two different kinds of storage, with one off-site. For a cloud system, "off-site" has to mean real isolation:

- **Another account or project**, with separate credentials. An attacker with production access must not be able to delete the backups. If a lost region is on your list, the copy must also be in another region.
- **Immutable storage** (for example S3 Object Lock in compliance mode): a backup can't be changed or deleted before its retention period ends, even by an admin. Weaker modes can be bypassed by authorized users, so check which one you use.
- **Encryption, with the keys stored separately.** A backup you can't decrypt is worthless, and losing the key is another disaster.
- **More than the database.** Uploaded files, configuration, secrets, DNS records, and [infrastructure as code](/delivery/deployment-models/#landscape) (infrastructure described in files) to rebuild the rest. Source code in Git counts only if Git itself is backed up somewhere.
- **A consistent set.** A database from 10:00 with uploads from 09:00 and a queue from 10:05 don't match. Restore a compatible set, or plan to reconcile the differences. External effects don't rewind: restored jobs can send an email or charge a card again, so [idempotency](/architecture/reliability/#idempotency-making-again-safe) matters here too.

## Recovery strategies

From cheapest to most expensive (the names come from the AWS guidance; the times are rough orders of magnitude, not promises):

| Strategy | What runs in the second location | RTO | RPO | Cost |
| --- | --- | --- | --- | --- |
| **Backup and restore** | Only backups; rebuild on demand | Hours or longer | Time since the last backup, or minutes with PITR | Lowest |
| **Pilot light** | Data replicated; core resources ready; app servers off until switched on | Tens of minutes | Seconds to minutes | Low |
| **Warm standby** | A small but working copy that can take traffic at once | Minutes | Seconds | Medium |
| **Multi-site active/active** | Full production in several regions | Near zero for a lost region | Near zero for a lost region | Highest |

Even active/active doesn't remove the need for backups: a bad write reaches all regions, and its recovery time is never zero. Running in two regions also brings every problem from [going global](/architecture/scaling/#going-global), especially around writes.

Most small and mid-size apps do well with **backup and restore with PITR, in one region with several availability zones** (separate data centers in one region), plus infrastructure as code. If a region-wide outage is on your list, keep backup copies in another region, so that you can rebuild there. Be honest about what such an outage would cost before you pay for more.

## Failing over traffic

Moving users to the recovery site has its own traps:

- **Decide who decides.** Automatic failover on a false alarm can cause an outage or data loss. Many teams keep the steps automated and the decision manual, like pressing one button.
- **Prevent two primaries.** If the old primary comes back while the new one is taking writes, the data splits (a **split brain**). The old one must be fenced off.
- **Expect lost writes.** Asynchronous replication means the last seconds may be missing. Decide how to reconcile them later.
- **[DNS](/web-platform/dns/#changing-dns-safely) is slow to switch**, because of caches. A [CDN](/web-platform/cdn/) (servers near users in front of your app) or a global load balancer can move traffic faster.
- **Don't depend on what just failed.** Failover steps that use the broken region's control panel, or a status page hosted on the same platform, fail with it.
- **Plan the way back.** Returning to the primary site after the event is a second migration.

## Restore drills: a backup is only a hope

**A backup that was never restored isn't a backup.** Backup jobs fail silently: a wrong path, an expired credential, a dump that is empty.

- **Restore automatically on a schedule**, into a separate environment, and check the result: row counts, a few known records, the app starting against it, and one real business journey.
- **Monitor the backups**: when the last one finished, its size compared with yesterday's, how far the log archive lags ([alerts](/observability/dashboards-alerting/)).
- **Measure the time.** The drill shows your actual recovery time, to compare with the RTO, and it often surprises people: restoring a terabyte takes hours.
- **Rehearse the whole failover**, not only the data, including the people: who decides, who has the access, where the [runbook](/observability/dashboards-alerting/#on-call-and-incident-response) (the written recovery steps) lives if the wiki is down.

The well-known case is GitLab in January 2017. An engineer deleted the production database directory during an incident, and of the several backup methods in place, none worked as expected. Recovery depended on a staging snapshot taken six hours earlier, so about six hours of data were lost. The lesson isn't the mistake, it is that nobody had tested the backups.

## Who is responsible

Managed services move the work; they don't remove the responsibility.

- A **managed database** usually gives automated backups and PITR within a retention window. Check the window, whether backups survive deleting the instance, and whether they are in another region.
- **SaaS tools** (software you rent as a service: your [CMS](/data/cms/), your source host, your auth provider) hold business data too. Can you export it? Have you tried?
- **Cloud providers** protect the platform, not your mistakes. Whether a deleted bucket can come back depends on the protection you enabled and verified, such as soft delete or versioning.
- **Vendor risk**: a suspended account or a bankrupt vendor is a disaster too. An export kept elsewhere is your exit.

## Typical failures

- **Treating replicas as backups**, and finding out when a bad write reaches them.
- **Backups never restored.**
- **Backups in the same account** as production, deleted by the same attacker or the same script.
- **Retention shorter than discovery time**: the corruption is older than the oldest backup.
- **The database restored, the rest missing**: no uploads, no secrets, no configuration.
- **An RTO on paper**, while the real restore takes all day.
- **Keys stored only in the system that was lost.**
- **A runbook that lives inside the system that is down.**
- **Failover never tested**, so the first attempt happens during the outage.
- **Paying for active/active** without the operational maturity to run it; the extra complexity causes its own outages.

## How to choose

1. **List what you can't lose**, and for each item write its RPO and RTO with the business.
2. **List the disasters** you care about: deleted data, a lost zone, a lost region, a stolen credential. Backups answer most of them.
3. **Pick the cheapest strategy** that meets the numbers.
4. **Isolate the backups**, and automate restore tests.
5. **Write the runbook**, and rehearse it at least once or twice a year.

Sensible default: a managed database with PITR, backups copied to a separate account (and region, if you plan for a lost region) with immutability, infrastructure as code, and a monthly automated restore test.

## Landscape

- **Database backups:** managed PITR in Amazon RDS and Aurora, Google Cloud SQL, Neon, Supabase; pgBackRest, Barman and WAL-G for PostgreSQL; Percona XtraBackup for MySQL.
- **Backup services:** AWS Backup, Azure Backup, Google Cloud Backup and DR, Restic, Velero (Kubernetes).
- **Immutable storage:** S3 Object Lock, Azure immutable blob storage, Google Cloud Bucket Lock.
- **Failover and traffic:** Amazon Route 53 health checks, AWS Application Recovery Controller, CDNs and global load balancers.
- **Rehearsal:** fault injection tools ([reliability](/architecture/reliability/#how-to-apply)), game days (planned practice incidents).
