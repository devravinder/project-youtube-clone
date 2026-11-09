# Tasks

Project task tracker, ordered stage by stage. We work **one task at a time**; each task is
reviewed and then committed (see the `git-commit-convention` skill). Detailed executable
tasks for a feature live in its Kiro spec (`.kiro/specs/<feature>/tasks.md`); this file is
the project-level roadmap and status.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

---

## Stage 0 — Groundwork (docs, decisions, skills)

- [x] Discuss scope, stack, and architecture
- [x] `docs/PRD.md` — learning-framed, 9-section, tech-free
- [x] `docs/prd-generation-prompt.md` — reusable PRD prompt + worked example
- [x] `docs/LEARNING-GOALS.md` — concepts → where → why → OSS tool
- [x] `docs/DECISIONS.md` — ADR log (ADR-001..012)
- [x] `docs/SKILLS.md` — skills index + global/project guide
- [x] Skills: prd-generation, frontend-react-vite-tailwind, nestjs-microservice,
      spring-microservice, messaging-patterns, observability-otel, k8s-kind-helm,
      monorepo-pnpm, testing-strategy, git-hooks-conventions, git-commit-convention,
      doc-with-mermaid, markdown-lint
- [x] NestJS↔Spring library mapping + pattern decision (ADR-011, ADR-012)
- [x] `docs/TASKS.md` — this tracker
- [x] `code-comments` skill; trimmed all existing comments to match
- [x] `.gitattributes` — normalize line endings (silence LF/CRLF warnings)
- [x] `README.md` — project overview + quick architecture
- [x] `docs/architecture.md` — system architecture and flows (Mermaid)
- [x] `docs/HOW-TO-RUN.md` — how to start/stop/run (kept updated as pieces are added)
- [x] `docs/LEARNING-GOALS.md` — add named theory concepts (CAP, outbox, queues, …)
- [x] Decide: "update TASKS.md after each task" — standing rule in `git-commit-convention`

## Stage 1 — Phase 0: Foundations (monorepo + storage skeleton)

Goal: end-to-end upload + playback with no queue, no transcoding.
Concepts: object storage, presigned/multipart upload, relational modeling, ports & adapters.

- [x] pnpm workspace skeleton (`pnpm-workspace.yaml`, root `package.json`, scripts)
- [x] `infra/docker-compose-local.yaml` — Postgres + MinIO (+ consoles)
- [x] `libs/ts/config` — zod-validated typed config
- [x] `libs/ts/ports` — `StoragePort` interface
- [x] `apps/upload-service` (NestJS) — S3 adapter (MinIO) + presigned-upload endpoint
- [x] `http/` — httpYac request files shared by all services
- [x] Prisma schema + first migration (video metadata)
- [x] `upload-service`: save a `Video` row on presign (PrismaService + adapter-pg)
- [x] `upload-service`: `GET /videos` and `GET /videos/:id` with playback URL (interim home)
- [x] `apps/web` scaffold: React 19, Vite, Tailwind v4 theme, tailwind-variants
- [x] `apps/web` pages: upload, video list (infinite scroll), watch (react-player), back button, themed UI
- [x] Confirm-upload endpoint and a pending status, so unfinished uploads are not listed as uploaded
- [x] Scheduled cleanup of abandoned pending uploads (cron, TTL `UPLOAD_PENDING_TTL_MINUTES`)
- [x] Multipart / resumable upload: parallel parts, retries, resume, cancel, abort of incomplete parts
- [x] Keycloak in compose with an imported `youtube-clone` realm (client `yt-web`, user `alice`)
- [x] Verify Keycloak JWTs in upload-service (`jose` guard), protect upload endpoints, record video owner
- [x] Login and logout in the web app (OIDC code flow with PKCE), route guard, bearer token on API calls
- [x] OpenAPI 3.1 from Zod (Swagger UI at `/docs`), spec in `contracts/`, web types via `openapi-typescript`
- [x] On multipart complete, check every part size against the plan, so the total equals the declared file size
- [x] Tests: Vitest + supertest for upload-service (75), Vitest + Testing Library for web (51)
- [x] Root DB scripts: `db:generate`, `db:migrate`, `db:reset` (reset refuses non-local databases)
- [x] Typed API client: `openapi-fetch` over the generated `paths` type, so paths, params and responses are compile-time checked
- [x] Git hooks: Husky + lint-staged + commitlint + markdownlint

## Stage 2 — Phase 1: Async transcoding (RabbitMQ + ffmpeg)

Goal: upload returns instantly; transcoding happens in the background.
Concepts: async processing, work-queue semantics, outbox, idempotency, polyglot services.

- [x] Add RabbitMQ to `docker-compose-local.yaml` (+ management UI), `rabbitmqEnv` in `@yt/config`
- [x] `apps/transcoder-service` skeleton (Spring Boot 4.1 / Java 21): domain, ports, `TranscodeService`, ArchUnit rules, JaCoCo gate, health probes
- [x] Java formatting: Spotless + google-java-format (as in the reference starter), formats on compile, lint-staged entry
- [x] Transcoder conventions from the reference starter: version catalog, `AppProperties` record (`@ConfigurationProperties`), YAML per profile (`local`, `local-observability`, `aws`), Lombok, SLF4J, MapStruct
- [x] RabbitMQ command producer (upload-service) + consumer (transcoder): `yt.transcode` → quorum queue + DLQ, publisher confirms, 503 + stays `PENDING` when the broker is down, JSON Schema contract in `contracts/`
- [x] Storage (MinIO, AWS SDK v2) + ffmpeg adapters: MP4 renditions per ladder rung into `hls-videos/<id>/`; ffmpeg runs in `mwader/static-ffmpeg` locally or as installed binaries
- [x] Transactional outbox in Postgres: confirm writes status + command in one transaction; `OutboxRelay` claims with `FOR UPDATE SKIP LOCKED` + lease, publishes with confirms, retries with backoff, purges sent rows
- [x] Idempotent consumer + DLQ + retries: `manifest.json` written last makes duplicates a no-op; transient failures wait in a TTL retry queue (3 attempts), permanent ones go straight to the DLQ
- [x] Upload status polling in the UI: transcoder reports `PROCESSING`/`READY`/`FAILED` on `yt.video-status` (publisher confirms); upload-service applies forward-only transitions; `GET /videos/:id` returns signed renditions; upload card and watch page poll every 2 s until done, with a quality picker

## Stage 3 — Phase 2: Real streaming (HLS + nginx edge)

Goal: adaptive-bitrate playback served through an edge cache.
Concepts: ABR/HLS, CDN/edge caching, byte-range/seek.

- [x] ffmpeg produces HLS (manifest + segments) into MinIO hls bucket: 4 s segments, keyframes aligned every 2 s, master playlist with bandwidth/resolution; bucket readable (not listable) anonymously; API serves the master as `playbackUrl`
- [x] React player uses adaptive bitrate (hls.js): Auto (shows the level it picked) or a pinned level that switches at the next segment; native HLS on Safari; error recovery; `react-player` removed
- [x] nginx edge cache + cache headers + byte-range: `yt-edge` on 8088 (RHEL nginx 1.26.3), segments immutable for a year, playlists 60 s, ranges from cache, cache lock, stale-on-error, only segments/playlists exposed
- [x] Verify seek + quality switching under throttled bandwidth: at 1.2 Mbps ABR steps 720p → 360p without pausing, seek fetches the target segment directly, pinning overrides ABR, and a second viewer gets edge HITs; the forward buffer is capped at 30 s (the default prefetched ~160 s)

## Stage 4 — Phase 3: Events & search (Kafka + Elasticsearch + notifications)

Goal: one event fans out to independent consumers.
Concepts: event log, consumer groups/replay, search sync, real-time notifications.

- [x] Add Kafka (Bitnami, KRaft) + Elasticsearch to compose: `yt-kafka` (host `localhost:9094`), topics `yt.video-events` (3 partitions, key videoId, compacted) and `.dlt` from a one-shot `kafka-setup`; `yt-elasticsearch` 8.19.16 single node on 9200
- [x] Emit `video.ready` event (from outbox) to Kafka: written with the READY transition, keyed by videoId, schema in `@yt/contracts`; publishes time out after 10 s so a hung broker cannot stall the relay
- [x] `apps/search-service` (NestJS) — Kafka consumer → Elasticsearch indexer: group `search-service`, manual commit after indexing, external versions (idempotent), DLT for poison events, `/search` (typo-tolerant) and `/search/suggest` (search_as_you_type); rebuild = new group or offset reset
- [x] `apps/notification-service` (NestJS) — Kafka consumer → WebSocket: own consumer group per instance (`latest`, no commits) so every instance sees every event; owner gets `video.ready`, others `video.published`; token sent in an `auth` message; deduped by eventId; toasts in the web app
- [x] Search UI (query + autocomplete): header search box (ARIA combobox, 200 ms debounce, arrows/Enter/Escape), `/search?q=` results with infinite scroll and safe highlighting; typed client from `contracts/search-service.openapi.json`
- [x] AsyncAPI event contract in `libs/ts/contracts`: `contracts/asyncapi.json` (AsyncAPI 3.1) generated from the Zod schemas — Kafka topics, DLT, `/ws` socket, operations per service with consumer groups; validated by `@asyncapi/parser` in tests

## Stage 5 — Phase 4: Scale & resilience (kind + Helm + HPA + k6)

Goal: reproduce load, watch the system scale and absorb back-pressure.
Concepts: caching, eventual consistency, back-pressure, autoscaling, load testing.

- [x] Redis caching (hot metadata) + view counts (eventual consistency): cache-aside `video:<id>` (60 s TTL, evicted on every write), views via an atomic Lua `SET NX` + `INCR` flushed to Postgres every 10 s (`SPOP`/`GETDEL`, exactly once across instances), `volatile-lru`, 500 ms guard with Postgres fallback
- [ ] kind cluster + Helm umbrella chart (per-service subcharts)
- [ ] HPA on CPU/memory, then on queue depth
- [ ] k6 load scripts (smoke / cpu / throughput)
- [ ] Windows `ctr import --no-unpack` image-loading script
- [ ] Observe DLQ depth, retries, autoscaling under load

## Stage 6 — Phase 5: Observability (otel-lgtm)

Goal: one trace across the whole pipeline.
Concepts: metrics, traces, logs; context propagation across brokers.

- [x] Add `grafana/otel-lgtm` to `docker-compose-local-observability.yaml`: `yt-lgtm` (collector + Tempo + Prometheus + Loki + Grafana 11.2) on 3000/4317/4318, the file `include`s the local stack
- [x] NestJS OTel SDK + Spring Micrometer OTLP export: `@yt/telemetry` (`--import` register, NodeSDK 0.300, auto-instrumentations + Prisma, Nest logger → OTel logs) and `spring-boot-starter-opentelemetry` + Logback appender; traces, metrics and logs from all four services reach Tempo, Prometheus and Loki
- [x] Context propagation across HTTP + RabbitMQ + Kafka: outbox rows store the W3C trace context and the relay publishes inside it; amqplib instrumentation and Spring AMQP observation for RabbitMQ, manual producer/consumer spans for Kafka; polling untraced; one upload = one trace over all four services
- [x] Grafana dashboards; trace one upload end to end: provisioned "Mini YouTube - pipeline" (HTTP RED, outbox backlog/publishes, transcode jobs, search events, notifications, views, runtime, recent-upload traces, warnings from Loki) plus business metrics (`yt.outbox.*`, `yt.search.events`, `yt.notifications*`, `yt.views.*`); every panel query checked against live data
- [ ] `local` vs `local-observability` profile gating

## Stage 7 — Phase 6: Cloud (optional)

Goal: deploy the same open-source tools to AWS.
Concepts: ports/adapters payoff (config swap, not rewrite).

- [ ] EKS deploy target
- [ ] Optional: swap MinIO → S3 via the storage adapter (config change)
- [ ] Verify everything runs with the `aws` environment profile
