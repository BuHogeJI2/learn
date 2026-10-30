---
title: DNS
description: How a name becomes an address, who holds each piece of the answer, what the common records do, and why a DNS change is never an instant global switch.
related:
  - web-platform/page-loading
  - web-platform/cdn
  - delivery/disaster-recovery
officialDocs:
  - title: MDN — What is a domain name?
    url: https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/What_is_a_domain_name
  - title: Cloudflare Learning — What is DNS?
    url: https://www.cloudflare.com/learning/dns/what-is-dns/
  - title: RFC 1034 — Domain names, concepts and facilities
    url: https://www.rfc-editor.org/rfc/rfc1034
  - title: RFC 2308 — Negative caching of DNS queries
    url: https://www.rfc-editor.org/rfc/rfc2308
  - title: RFC 8659 — CAA resource record
    url: https://www.rfc-editor.org/rfc/rfc8659
  - title: RFC 9460 — SVCB and HTTPS resource records
    url: https://www.rfc-editor.org/rfc/rfc9460
---

## What problem it solves

People and links use names such as `shop.example`; networks deliver packets to IP addresses. **DNS** (Domain Name System) is the global, distributed database that connects them. It also holds other facts about a domain: where its mail goes, who may issue its certificates, proof that you own it.

For a frontend developer, DNS shows up in a few recurring situations: connecting a custom domain to a hosting platform, a site that works for you but not for a colleague, an email that lands in spam after a domain move, and a certificate that fails to renew. In [How a browser loads a page](/web-platform/page-loading/#the-journey) it is one short step, and that step is simple only as long as nothing changes.

## Mental model: a delegated tree, answered through caches

No single server knows all names. Authority is **delegated** down a tree, and each level says who is responsible for the next one.

```
browser ─► OS cache ─► recursive resolver (your ISP, 1.1.1.1, 8.8.8.8)
                            │  cache empty? ask down the tree:
                            ├─► root servers      "ask the .example servers"
                            ├─► TLD servers       "ask ns1.provider.example"
                            └─► authoritative     "shop.example = 203.0.113.7, TTL 300"
                            │
                       stores the answer for its TTL
```

Four separate roles, which are easy to mix up:

| Role | What it does | Example |
| --- | --- | --- |
| **Registrar** | Sells you the domain and records which name servers are in charge of it | Namecheap, Porkbun, Cloudflare Registrar |
| **Authoritative DNS** | Holds your records and gives the final answer | Cloudflare DNS, Route 53, your host's DNS |
| **Recursive resolver** | Asks on behalf of users and caches the answers | Your ISP's resolver, 1.1.1.1, 8.8.8.8 |
| **Host** | Runs the site the records point to | Vercel, Netlify, your own server |

One company can play several roles, which is why they get confused. But "I changed the record at the registrar" and "I changed the record at the DNS provider" can mean two different places, and only the one the **NS records** point to is in use.

**TTL** (time to live) on each record says how long, in seconds, a resolver may keep the answer. Almost every DNS surprise comes from this: you don't update the internet, you update one server, and the old answers stay in caches around the world until they expire.

## Common records

| Record | Maps | Typical use |
| --- | --- | --- |
| **A** | Name → IPv4 address | The site's address |
| **AAAA** | Name → IPv6 address | The same, for IPv6 |
| **CNAME** | Name → another name | `www` → `cname.host.example`; the host can change its IPs freely |
| **NS** | Name → its name servers | Delegation |
| **SOA** | Zone (the part of DNS managed together) → its basic settings | Required for each zone; also sets how long "no such name" is cached |
| **MX** | Domain → mail servers | Where email for the domain goes |
| **TXT** | Name → free text | Domain ownership checks, SPF, DKIM and DMARC for email |
| **CAA** | Domain → allowed certificate authorities | Which authorities may issue [certificates](/web-platform/http/#https-what-tls-adds) |
| **HTTPS** (SVCB) | Name → connection hints | HTTP/3 support, IP hints, delivered before the first connection |

DNS only finds an address. It knows nothing about URL paths or redirects, and a name that resolves says nothing about the connection, the certificate or the site behind it. When a site fails, check the layers in order: DNS, connection, [TLS](/web-platform/http/#https-what-tls-adds), HTTP.

**A CNAME is an alias for the whole name**, so a name with a CNAME can't have any other records. That leads to the classic problem: the **apex** (the bare domain, `shop.example`) must have NS and SOA records, so it can't be a CNAME. Options:

- **Provider-specific flattening** (`ALIAS`, `ANAME`, CNAME flattening): your DNS provider looks up the target and answers with plain A records. Convenient, but not a standard record type, and it depends on the provider.
- **A records** with the host's fixed IPs, if the host offers them.
- **HTTPS records** have their own alias form that works at the apex, but it depends on client support, so it doesn't replace A records yet.
- **Redirect the apex to `www`**, and point `www` at the host with a CNAME. The apex still needs address records and a valid certificate, because the browser must reach it to receive the redirect.

## Changing DNS safely

"DNS propagation" sounds like an update spreading outward. Really, nothing is pushed: old answers **expire from caches**, one resolver at a time.

```
t=0     you change the record (old TTL: 3600 s)
t=0…1h  some users get the new answer, some the old one
t>1h    caches have expired; everyone should get the new answer
```

So for a planned move:

1. **Lower the TTL first**, for example to 300 seconds, at least one old TTL before the change.
2. **Run both targets during the switch.** The old server must keep working until the old TTL has passed; some clients hold on longer.
3. **Make the change**, and check it directly at the authoritative server (`dig @ns1.provider.example shop.example`).
4. **Raise the TTL again** when you are done. Low TTLs mean more lookups for users and more load on DNS.

Things that make it slower than expected:

- **Negative caching.** "This name doesn't exist" and "this name has no record of that type" are cached too, for a time set by the domain's SOA record. If you tried a name before creating it, the old answer can stay in caches after you add the record, whatever TTL the new record has.
- **Changing name servers** at the registrar is slower than changing a record. NS records sit in the parent zone with their own TTL, often 24–48 hours, and you can't lower it. Copy all records to the new provider *before* you switch, and if the zone uses DNSSEC, follow the providers' migration steps: a mismatch between the keys and the parent zone makes the domain fail for validating resolvers.
- **More caches than the resolver.** Browsers and operating systems keep their own copies, some resolvers ignore low TTLs, and during an outage of the authoritative servers a resolver may keep serving stale answers.
- **It isn't a precise failover tool.** Because of caches, DNS can't move all traffic in seconds. Load balancers and [anycast](/web-platform/cdn/#mental-model-a-reverse-proxy-in-front-of-everything) (one IP address announced from many locations) react faster ([disaster recovery](/delivery/disaster-recovery/#failing-over-traffic)).

## Security and privacy

- **Classic DNS is unencrypted and unauthenticated**: anyone on the path can read which names you look up, and can try to forge answers.
- **DoH and DoT** (DNS over HTTPS, DNS over TLS) encrypt the trip between the client and the resolver. They hide queries from the local network, not from the resolver.
- **DNSSEC** signs records, so a resolver can check that an answer is authentic. It doesn't encrypt anything, and a mistake in its setup makes the whole domain fail for resolvers that validate.
- **Subdomain takeover.** A CNAME that still points to a deleted service (an old preview, a removed bucket) can be claimed by an attacker on that service, who then serves content under your domain. Remove the record when you remove the service. It matters for cookies too: see [site boundaries](/security/browser-boundaries/#when-the-browser-sends-cookies).
- **Registrar account takeover** is the worst case: whoever controls the domain controls everything behind it, including certificates and email. Use [MFA](/security/auth/#how-users-prove-who-they-are) (a second login factor) and a registrar lock.

## Typical failures

- **Records edited in the wrong place**: at the registrar, while the NS records point to another provider.
- **A CNAME on the apex**, which the provider refuses or which breaks mail and other records.
- **Moving a domain without copying MX and TXT records**: the site works, and email silently stops.
- **Switching with a long TTL**, then waiting a day for a rollback to take effect.
- **Shutting down the old server** while caches still point to it.
- **A CAA record** that doesn't list the certificate authority your host uses, so issuing or renewing a certificate fails.
- **Testing from one machine**: "it works for me" says only what your resolver has cached. Query several resolvers.
- **A dangling CNAME** to a removed service.
- **A stale AAAA record**: users with IPv6 reach a dead or wrong server while IPv4 tests pass. Check A and AAAA together.
- **A forgotten domain renewal.** The whole site and its email stop.

## When this knowledge pays off

- **A custom domain on a hosting platform:** the platform tells you which record to add. Expect a TXT record for ownership, and a CNAME or A record for traffic.
- **Moving hosts or providers:** plan the TTL steps and overlap above.
- **Debugging "works here, not there":** compare the authoritative answer with what different resolvers return.
- **Email deliverability:** SPF, DKIM and DMARC records decide whether your mail is trusted.
- **Performance:** a DNS lookup is one more [round trip](/web-platform/page-loading/#the-journey) on first visits; `dns-prefetch` and `preconnect` can do it ahead of time for important third parties.

## Landscape

- **Authoritative DNS:** Cloudflare DNS, Amazon Route 53, Google Cloud DNS, NS1, your hosting platform's DNS.
- **Public resolvers:** Cloudflare 1.1.1.1, Google 8.8.8.8, Quad9.
- **Registrars:** Cloudflare Registrar, Namecheap, Porkbun, Gandi.
- **Inspection:** `dig` and `nslookup`, whatsmydns.net (answers from many locations), Google Admin Toolbox Dig, DNSViz for DNSSEC, Chrome's `chrome://net-internals/#dns`.
- **[Infrastructure as code](/delivery/deployment-models/#landscape):** records described in files and managed with Terraform or OctoDNS, so that changes are reviewed.
