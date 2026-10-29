# Translating to Russian

Rules for writing and editing the Russian pages in `src/content/docs/ru/`.
The structural rules (paths, text-only frontmatter, same-change updates) are
in `AGENTS.md`.

## How to translate

- Translate faithfully: same sections, same claims, same strength of each
  recommendation, same uncertainty. Add nothing, drop nothing, don't rewrite
  as an explanation.
- Code, commands, identifiers, HTTP headers, file names, API names and error
  text stay exactly as they are.
- Use "вы" for the reader.
- Follow the glossary. A term marked "English" stays in English; the first
  time it appears on a page, add its Russian meaning in brackets:
  "hit rate (доля попаданий в кэш)". Later uses on the page need no brackets.
- A term not in the glossary: keep it in English if Russian developers usually
  say it in English, otherwise use the common Russian word. Add the decision
  to the glossary.

## Glossary

| English | Russian | Rule |
| --- | --- | --- |
| cache, caching | кэш, кэширование | Russian |
| cache key | ключ кэша | Russian |
| invalidation | инвалидация | Russian |
| request, response | запрос, ответ | Russian |
| header | заголовок | Russian |
| server, browser, database | сервер, браузер, база данных | Russian |
| layer | слой | Russian |
| build, deploy | сборка, деплой | Russian |
| framework | фреймворк | Russian |
| freshness | свежесть | Russian |
| scope | scope (кто видит данные) | English |
| CDN, edge, origin | CDN, edge, origin | English |
| TTL, hit rate | TTL, hit rate | English |
| stale-while-revalidate | stale-while-revalidate | English |
| purge | purge | English |
| cache stampede, thundering herd | cache stampede, thundering herd | English |
| cache-aside, write-through, write-behind | same | English |
| request coalescing, jitter | same | English |
| serverless | serverless | English |
| fallback | fallback | English |
| static shell, Partial Prerendering | same | English |
| Server Components, Server Actions, Route Handlers, Draft Mode | same | English |
| read-your-own-writes | read-your-own-writes | English |
| Observability, Delivery (domain names) | Мониторинг, Поставка ПО | Russian; translate every domain name that is not a tool name |
| status code | статус-код | Russian |
| safe, idempotent (method) | безопасный, идемпотентный | Russian |
| endpoint | эндпоинт | Russian |
| contract, schema | контракт, схема | Russian |
| hydration, streaming | гидратация, стриминг | Russian |
| source of truth | источник истины | Russian |
| optimistic update | оптимистичное обновление | Russian |
| main thread | главный поток (main thread) | Russian |
| round trip, RTT, TTFB | same | English |
| handshake | handshake | English |
| waterfall, preload scanner, layout shift | same | English |
| islands, resumability | same | English |
| over-fetching, under-fetching | same | English |
| breaking change | breaking change | English |
| idempotency key | idempotency key | English |
| race condition | race condition | English |
| reverse proxy, PoP, anycast | same | English |
| origin shield, request collapsing | same | English |
| DDoS, WAF, rate limiting | same | English |
| site (as in same-site) | сайт | Russian |
| same-origin policy, CORS, preflight | same | English |
| credentials | учётные данные | Russian |
| XSS, CSRF, CSP, clickjacking, nonce, sink | same | English |
| supply chain, Trusted Types, SRI | same | English |
| escaping, sanitizer | экранирование, санитайзер (санитизация) | Russian |
| authentication, authorization | аутентификация, авторизация | Russian |
| session, token | сессия, токен | Russian |
| access token, refresh token, ID token, JWT, claims | same | English |
| OAuth, OIDC, PKCE, SSO, MFA, passkey | same | English |
| identity provider, IDOR, session fixation, credential stuffing | same | English |
| RBAC, ABAC, ReBAC, tenant, multi-tenant | same | English |
| relational, document, graph, vector, columnar (database) | реляционная, документная, графовая, векторная, колоночная | Russian |
| key-value, wide-column, time-series, OLTP, OLAP | same | English |
| index, inverted index | индекс, инвертированный индекс | Russian |
| join, B-tree, ORM, schemaless | same | English |
| normalization, denormalization | нормализация, денормализация | Russian |
| replica, sharding, partitioning | реплика, шардинг, партиционирование | Russian |
| object storage | объектное хранилище | Russian |
| consistency, transaction, isolation level | согласованность, транзакция, уровень изоляции | Russian |
| ACID, write skew, deadlock, clock skew | same | English |
| lost update, non-repeatable read | потерянное обновление, неповторяющееся чтение | Russian |
| Read committed, Repeatable read, Serializable | same | English |
| optimistic, pessimistic locking | оптимистичная, пессимистичная блокировка | Russian |
| strong consistency, monotonic reads | строгая согласованность, монотонное чтение | Russian |
| eventual consistency, CAP | same | English |
| saga, compensating action | сага, компенсирующее действие | Russian |
| dual write, transactional outbox, CDC | same | English |
| monolith, modular monolith, microservices | монолит, модульный монолит, микросервисы | Russian |
| micro-frontends | микрофронтенды | Russian |
| API gateway, bounded context, service mesh, big ball of mud | same | English |
| Conway's law | закон Конвея | Russian |
| deployment model, artifact, instance | модель деплоя, артефакт, инстанс | Russian |
| container, image, orchestrator | контейнер, образ, оркестратор | Russian |
| cold start, PaaS, VM, isolate | same (isolate: изолят) | English |
| CI/CD, pipeline | CI/CD, пайплайн | Russian |
| continuous integration, delivery, deployment | непрерывная интеграция, поставка, развёртывание | Russian |
| rolling, blue-green, canary, recreate | same | English |
| feature flag | фича-флаг | Russian |
| preview deployment, version skew, skew protection, infrastructure as code | same | English |
| readiness check, liveness, drain | same | English |
| observability | observability (with a short Russian explanation; the user dislikes «наблюдаемость») | English |
| monitoring, logs, metrics, traces, span | мониторинг, логи, метрики, трейсы, спан | Russian |
| sampling, head sampling, tail sampling | сэмплирование; head/tail sampling stay English | Russian |
| cardinality, percentile, histogram | кардинальность, перцентиль, гистограмма | Russian |
| SLI, SLO, SLA, error budget, burn rate, runbook, RUM | same | English |
| alert, dashboard, on-call | алерт, дашборд, дежурство | Russian |
| saturation | насыщение (saturation) | Russian |
| alert fatigue, source maps | same | English |
| bottleneck, headroom, load balancer | узкое место, запас мощности, балансировщик нагрузки | Russian |
| vertical, horizontal scaling, autoscaling | вертикальное, горизонтальное масштабирование, автомасштабирование | Russian |
| sticky sessions, health check, hot spot | sticky sessions, health check, горячая точка | English / Russian |
| Little's law | закон Литтла | Russian |
| timeout, deadline, retry | таймаут, дедлайн, повтор | Russian |
| backoff, exponential backoff, retry budget, retry storm | same | English |
| circuit breaker, fallback, graceful degradation, load shedding, backpressure, bulkhead | same | English |
| token bucket, cascading failure | token bucket, каскадный сбой | English / Russian |
| durable execution, fault injection, chaos engineering | same | English |
| job queue, producer, consumer, worker | очередь задач, производитель, потребитель, обработчик | Russian |
| pub/sub, offset, partition key, backlog | same | English |
| at least once, at most once, exactly once, effectively once | same | English |
| acknowledgement, visibility timeout | подтверждение (ack), visibility timeout | Russian / English |
| poison message, dead-letter queue (DLQ) | same | English |
| polling, long polling, SSE, WebSocket, heartbeat, fan-out | same | English |
| sync engine, inbox | same | English |
| content model, editorial workflow, draft, preview | модель контента, редакционный процесс, черновик, превью | Russian |
| headless, slug, page builder, DXP, visual editing | headless, slug, конструктор страниц, DXP, визуальное редактирование | English / Russian |
| pipeline, stage, job, step, runner, agent, trigger | пайплайн, стадия, джоб, шаг, раннер, агент, триггер | Russian |
| environment (deploy target), promotion | окружение, продвижение | Russian |
| merge queue, flaky test | merge queue (очередь слияния), нестабильный тест (flaky) | English / Russian |
| trunk-based development, OIDC federation, GitOps, DORA metrics, provenance | same | English |
| lockfile | lock-файл | Russian |
| plan, plan branches, deployment project, release, requirements, capabilities (Bamboo) | same as in Bamboo's UI | English |
| image, layer, registry, digest, tag | образ, слой, реестр (registry), digest, тег | Russian / English |
| namespaces, cgroups, OCI, distroless, buildpacks, multi-stage build, build secret | same | English |
| volume | том (volume) | Russian |
| cluster, node, Pod, control plane | кластер, нода, под, control plane | Russian / English |
| Deployment, Service, Ingress, Gateway API, ConfigMap, Secret, StatefulSet, PersistentVolume(Claim), HPA, RBAC, reclaim policy | same (Kubernetes object names) | English |
| reconciliation, rolling update, readiness / liveness / startup probe | same, with a short Russian meaning on first use | English |
| requests and limits (Kubernetes) | requests и limits | English |
| instrumentation, Collector, exporter, OTLP, semantic conventions, baggage, log bridge | инструментация; остальное — same | Russian / English |
| context propagation | передача контекста | Russian |
| Core Web Vitals, LCP, INP, CLS, TTFB, FCP, TBT, CrUX, soft navigation | same | English |
| long task, field data, lab data | long task (длинная задача), полевые данные, лабораторные данные | English / Russian |
| error tracking, issue, event, fingerprint, breadcrumbs, session replay | отслеживание ошибок, issue, событие, fingerprint, breadcrumbs, запись сессий | Russian / English |
| incident, postmortem, incident commander, escalation, contact point, notification policy | инцидент, разбор (postmortem), руководитель инцидента, эскалация, точка контакта, политика уведомлений | Russian |
| monorepo, polyrepo, workspaces, CODEOWNERS | монорепозиторий (monorepo), polyrepo, workspaces, CODEOWNERS | Russian / English |
| crawl, index (search), user agent, sitemap, robots.txt, noindex, web app manifest, maskable icon, favicon | обход, индексация, user agent; остальное — same | Russian / English |
| Suspense, boundary, fallback, transition, error boundary | Suspense, граница, fallback, transition, error boundary | English / Russian |
| Server Components, Client Components, Server Functions, RSC payload | same | English |
| cache ID, fetch policy, field policy, keyFields, data masking | cache ID, fetch policy, field policy, keyFields, data masking (маскирование данных) | English |
| directive, incremental delivery | директива, частичная доставка (incremental delivery) | Russian |
