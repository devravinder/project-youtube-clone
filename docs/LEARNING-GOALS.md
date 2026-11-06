# Learning Goals — System Design via Mini YouTube Clone

This is the companion to `docs/PRD.md`. The PRD stays tech-free on purpose; this document
holds the system-design concepts we are learning, where each one appears in the product,
why it matters, and the open-source tool that teaches it.

Guiding principle: **open-source-first.** Use the widely-adopted open-source container for
each capability. Reach for a cloud service only when it is itself the industry standard and
has no open-source substitute worth learning. We learn the real mechanics, not managed magic.

---

## The journey of a video (mental model)

```
Upload → Store raw → Transcode (async) → Store HLS → Serve via edge/CDN → Stream (ABR)
                          │ emits "video.ready" event
                          ├────────────► Index into search
                          └────────────► Notify waiting viewers
```

The "video.ready" event fans out to multiple independent consumers. That single idea —
decoupling stages with events — is the highest-leverage lesson in the whole project.

---

## Concept map

| # | Concept | Where it appears | Why it matters | OSS tool that teaches it |
|---|---------|------------------|----------------|--------------------------|
| 1 | Object storage | Store raw + processed video | Blobs do not belong in a DB; learn buckets, keys, lifecycle | **MinIO** (S3-API compatible) |
| 2 | Resumable / multipart upload | Upload large files | A 2GB upload cannot be one POST | MinIO multipart |
| 3 | Presigned URLs | Client uploads direct to storage | Keep bytes out of the app server; scalability pattern | MinIO presigned |
| 4 | Asynchronous processing | Transcoding after upload | Slow work must not block the request | **RabbitMQ** (command queue) |
| 5 | Work queue semantics | Transcode jobs | Acks, retries, DLQ, prefetch/back-pressure | **RabbitMQ** |
| 6 | Event log / pub-sub | "video.ready" fan-out | One event, many consumers, replayable | **Apache Kafka** (or Redpanda) |
| 7 | Transactional outbox | DB write + publish event atomically | Avoid the dual-write problem | Postgres outbox + relay |
| 8 | Idempotency | Any queue consumer | Queues are at-least-once; dedupe is mandatory | RabbitMQ + Kafka consumers |
| 9 | Adaptive bitrate streaming | Playback | Player picks quality by bandwidth | **ffmpeg** (HLS) + hls.js |
| 10 | Transcoding | Upload → playable | CPU-heavy multi-resolution conversion | **ffmpeg** |
| 11 | CDN / edge caching | Serving segments | Cache near users; invalidation; byte-range | **nginx** |
| 12 | Full-text search | Search videos | Inverted index, relevance, analyzers vs SQL LIKE | **Elasticsearch** |
| 13 | Search sync | Keep index fresh | Denormalize from source of truth via events | Kafka → ES indexer |
| 14 | Caching | Hot metadata, view counts | Cache-aside, TTL, invalidation | **Redis** |
| 15 | Relational modeling | Video/channel/user metadata | Source of truth, indexing, constraints | **PostgreSQL** |
| 16 | Eventual consistency | View/subscriber counts | Not everything needs to be instant | Redis + Postgres |
| 17 | Authentication / OIDC | Who can upload/watch | Standard OAuth2/OIDC, JWT, roles | **Keycloak** |
| 18 | Real-time notifications | "Your video is ready" | WebSockets + event consumer | Kafka consumer + WebSocket |
| 19 | Back-pressure & autoscaling | Workers under load | Scale consumers by queue depth | **kind + Helm + HPA** |
| 20 | Observability | Everything | Trace one request across services | **grafana/otel-lgtm** (OTLP) |
| 21 | Load testing | Prove scale behavior | Reproduce spikes, watch autoscaling | **k6** |
| 22 | Ports & adapters | Every external dependency | Swap local↔cloud by config, not rewrite | hexagonal architecture |
| 23 | Polyglot microservices | Node + Java services | Language-agnostic contracts (events/REST) | NestJS + Spring Boot |

---

## Theory & distributed-systems concepts (the named ideas)

The table above is the *practical* map. These are the *named theoretical concepts* behind
it — the vocabulary to recognize and reason about. Each lists where it shows up in this
project.

### Consistency & availability

- **CAP theorem** — under a network **P**artition you must choose **C**onsistency or
  **A**vailability. Our metadata (Postgres) leans **CP** (correctness first); our view/
  subscriber counts lean **AP** (stay available, reconcile later). *Where: counts vs. the
  video record.*
- **PACELC** — the extension of CAP: **E**lse (no partition) you trade **L**atency vs.
  **C**onsistency. Caching view counts in Redis is a latency-for-consistency trade. *Where:
  Redis cache in front of Postgres.*
- **Eventual consistency** — replicas/derived data converge over time, not instantly. Search
  index and counts are eventually consistent with the source of truth. *Where: Elasticsearch
  index, view counts.*
- **Strong vs. read-your-writes consistency** — a creator should see their own just-uploaded
  video even if search hasn't indexed it yet. *Where: upload → "my videos" vs. public search.*
- **Source of truth** — Postgres is authoritative; search/cache/counts are *derived* and
  rebuildable. *Where: everywhere downstream of metadata.*

### Messaging & event-driven

- **Message queue vs. event log** — work-queue (RabbitMQ: consume-and-gone, competing
  consumers) vs. append-only log (Kafka: retained, replayable, many consumer groups).
  *Where: transcode command vs. `video.ready` event. See `messaging-patterns`.*
- **Pub/sub & fan-out** — one event, many independent subscribers. *Where: `video.ready` →
  search + notifications + (future) analytics.*
- **Delivery semantics** — at-most-once / **at-least-once** / exactly-once. Real brokers are
  at-least-once; "exactly-once" is achieved with idempotency, not magic. *Where: all consumers.*
- **Idempotency** — processing the same message twice yields the same result. Dedupe by event
  id or use upserts. *Where: transcode consumer, indexer.*
- **Transactional outbox** — solve the **dual-write problem** (DB write + publish must be
  atomic) by writing an `outbox` row in the same transaction, then relaying it. *Where:
  emitting `video.ready`. See `messaging-patterns`.*
- **Dead-letter queue (DLQ)** — park messages that fail after max retries instead of dropping
  them. *Where: transcode failures.*
- **Back-pressure** — let a slow consumer signal upstream to slow down (prefetch limits,
  bounded queues) rather than collapse. *Where: RabbitMQ prefetch + HPA.*
- **Ordering & partitioning** — Kafka guarantees order only within a partition (key by
  videoId). *Where: per-video event ordering.*
- **Saga / choreography** — a multi-step distributed workflow (upload → transcode → index →
  notify) coordinated by events, with compensation on failure. *Where: the whole pipeline.*
- **Event replay** — a new consumer group reads history to backfill. *Where: adding a future
  analytics/recommendations service.*

### Scaling & resilience

- **Horizontal vs. vertical scaling** — add instances vs. bigger instances. *Where:
  transcoder worker replicas.*
- **Statelessness** — stateless services scale freely; state lives in Postgres/Kafka/MinIO.
  *Where: API/services as Deployments, data as StatefulSets.*
- **Autoscaling (HPA)** — scale replicas by a signal (CPU, memory, or queue depth). *Where:
  transcoder scales on RabbitMQ backlog. See `k8s-kind-helm`.*
- **Caching strategies** — cache-aside, TTL, invalidation, and the **thundering-herd /
  cache-stampede** problem. *Where: Redis for hot metadata + counts.*
- **Load balancing** — spread requests across instances. *Where: nginx-ingress.*
- **Rate limiting** — protect upload/API endpoints from abuse. *Where: API gateway.*
- **Retries, timeouts & circuit breakers** — fail fast and recover gracefully. *Where:
  service-to-service and consumer logic.*
- **Graceful degradation** — if search is down, browsing still works. *Where: search vs. core
  playback.*

### Data & storage

- **Blob/object storage vs. database** — large media in object storage, metadata in the DB.
  *Where: MinIO vs. Postgres.*
- **Denormalization** — duplicate/shape data for fast reads (the search index). *Where:
  Elasticsearch documents.*
- **Indexing & inverted index** — how search differs from `WHERE title LIKE`. *Where:
  Elasticsearch.*
- **Read replicas & sharding (concept)** — scale reads and partition hot writes (view
  counts are the classic hot-write). *Where: discussed at the counts/Postgres boundary.*

### Delivery & streaming

- **Adaptive bitrate streaming (ABR)** — client picks quality per bandwidth via a manifest +
  segments (HLS/DASH). *Where: ffmpeg HLS + hls.js.*
- **CDN / edge caching** — serve segments near users; cache invalidation; **byte-range
  requests** for seeking. *Where: nginx edge.*
- **Presigned URLs & direct upload** — clients talk to storage directly, keeping bytes off
  the app server. *Where: upload flow.*

### Architecture & cross-cutting

- **Ports & adapters (hexagonal)** vs. **layered MVC** — isolate the domain from infra where
  it earns its keep. *Where: transcoder (hexagonal) vs. metadata (MVC). See `ADR-011`.*
- **Twelve-factor config** — config from the environment, validated and typed, never
  hardcoded. *Where: zod config / Spring `AppProperties`.*
- **Observability (three pillars)** — metrics, traces, logs — and **distributed tracing /
  context propagation** across service and broker boundaries. *Where: otel-lgtm. See
  `observability-otel`.*
- **Contracts** — OpenAPI for REST, **AsyncAPI** for events, so polyglot services agree.
  *Where: `libs/ts/contracts`.*


---

## Phased roadmap (each phase is runnable and teaches one thing deeply)

- **Phase 0 — Foundations:** monorepo, docker-compose (`local`), Postgres + MinIO, hexagonal
  skeleton with a `StoragePort`. Upload via presigned URL, play back with a plain player.
  No queue, no transcoding yet. *Concepts: 1, 2, 3, 15, 22.*
- **Phase 1 — Async transcoding:** add RabbitMQ + ffmpeg worker. Upload returns instantly;
  status is polled. Outbox + idempotent consumer. *Concepts: 4, 5, 7, 8, 10, 23.*
- **Phase 2 — Real streaming:** ffmpeg produces HLS; player uses adaptive bitrate; nginx edge
  cache + cache headers + byte-range/seek. *Concepts: 9, 11.*
- **Phase 3 — Events & search:** Kafka "video.ready" → Elasticsearch indexer + notification
  service. Search UI. *Concepts: 6, 12, 13, 18.*
- **Phase 4 — Scale & resilience:** Redis caching, view counts, DLQs, retries, kind + Helm +
  HPA, k6 load tests, watch workers autoscale. *Concepts: 14, 16, 19, 21.*
- **Phase 5 — Observability:** otel-lgtm, OTLP across Node↔Java, Grafana dashboards, trace one
  upload end to end. *Concept: 20.*
- **Phase 6 — Cloud (optional):** deploy to EKS; optionally swap MinIO→S3 via the storage
  adapter (config change, not rewrite). Everything else stays open-source.

---

## Tooling decisions (open-source-first)

| Capability | We use (OSS) | Cloud equivalent we deliberately avoid | Note |
|---|---|---|---|
| Object storage | MinIO | S3 | Same SDK; S3 optional at the very end |
| Command queue | RabbitMQ | SQS | Teaches ack/DLQ/prefetch |
| Event log | Apache Kafka / Redpanda | SNS+SQS | Teaches partitions/offsets/replay |
| Search | Elasticsearch | OpenSearch Service | Real inverted index |
| Cache | Redis | ElastiCache | Identical API |
| Relational DB | PostgreSQL | RDS/Aurora | Identical |
| CDN / edge | nginx | CloudFront | Cache headers by hand |
| Transcoding | ffmpeg | MediaConvert | Teaches HLS/ABR |
| Identity | Keycloak | Cognito | Industry-standard OIDC |
| Observability | grafana/otel-lgtm | CloudWatch/X-Ray | One container, OTLP standard |
| Orchestration | kind + Helm | EKS | EKS only as deploy target |

**AWS appears only as a deploy target:** EKS, and optionally real S3. Nothing else.

**Dropped on purpose:** Pyroscope (Linux-only, flaky on Windows), LocalStack (redundant once
we use real open-source tools instead of AWS services), fully-containerized `docker` env
(kind covers it).

---

## Environments

| Env | App | Infra | Observability |
|-----|-----|-------|---------------|
| `local` | dev server / IDE | Postgres, Redis, MinIO, RabbitMQ, Kafka, Elasticsearch, Keycloak | off |
| `local-observability` | dev server / IDE | all of the above + grafana/otel-lgtm | on (sampling 1.0) |
| `aws` | EKS | same OSS tools (optionally S3) | on |

---

## Stack summary

- **Backend (API & light services):** NestJS + TypeScript.
- **Backend (heavy/transcoding):** Spring Boot 4.1 + Java 21.
- **Frontend:** React 19 + TypeScript + Vite + Tailwind v4, no shadcn (shadcn-like theme),
  tailwind-styled-components for reusable components.
- **Messaging:** RabbitMQ (commands) + Kafka (events) — deliberately both, phased.
- **Monorepo:** pnpm workspaces (no Nx — keep it simple; the goal is system design).
- **Spec-driven:** Kiro Specs (`requirements.md` / `design.md` / `tasks.md`) per feature.
