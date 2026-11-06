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
- [x] `.gitattributes` — normalize line endings (silence LF/CRLF warnings)
- [x] `README.md` — project overview + quick architecture
- [x] `docs/architecture.md` — system architecture and flows (Mermaid)
- [x] `docs/LEARNING-GOALS.md` — add named theory concepts (CAP, outbox, queues, …)
- [x] Decide: "update TASKS.md after each task" — standing rule in `git-commit-convention`

## Stage 1 — Phase 0: Foundations (monorepo + storage skeleton)

Goal: end-to-end upload + playback with no queue, no transcoding.
Concepts: object storage, presigned/multipart upload, relational modeling, ports & adapters.

- [x] pnpm workspace skeleton (`pnpm-workspace.yaml`, root `package.json`, scripts)
- [ ] `infra/docker-compose-local.yaml` — Postgres + MinIO (+ consoles)
- [ ] `libs/ts/config` — zod-validated typed config
- [ ] `libs/ts/ports` — `StoragePort` interface
- [ ] `apps/upload-service` (NestJS) — MinIO adapter + presigned-upload endpoint
- [ ] Prisma schema + first migration (video metadata)
- [ ] `apps/web` (React 19 + Vite + Tailwind v4) — upload UI + plain playback
- [ ] Wire Keycloak (OIDC) — login + JWT verification
- [ ] Tests: Jest (service), supertest (controller), Vitest (web)
- [ ] Git hooks: Husky + lint-staged + commitlint + markdownlint

## Stage 2 — Phase 1: Async transcoding (RabbitMQ + ffmpeg)

Goal: upload returns instantly; transcoding happens in the background.
Concepts: async processing, work-queue semantics, outbox, idempotency, polyglot services.

- [ ] Add RabbitMQ to `docker-compose-local.yaml` (+ management UI)
- [ ] `apps/transcoder-service` (Spring Boot 4.1 / Java 21) — ports & adapters
- [ ] RabbitMQ command producer (upload-service) + consumer (transcoder)
- [ ] ffmpeg adapter — produce renditions
- [ ] Transactional outbox in Postgres
- [ ] Idempotent consumer + DLQ + retries
- [ ] Upload status polling in the UI

## Stage 3 — Phase 2: Real streaming (HLS + nginx edge)

Goal: adaptive-bitrate playback served through an edge cache.
Concepts: ABR/HLS, CDN/edge caching, byte-range/seek.

- [ ] ffmpeg produces HLS (manifest + segments) into MinIO hls bucket
- [ ] React player uses adaptive bitrate (hls.js)
- [ ] nginx edge cache + cache headers + byte-range
- [ ] Verify seek + quality switching under throttled bandwidth

## Stage 4 — Phase 3: Events & search (Kafka + Elasticsearch + notifications)

Goal: one event fans out to independent consumers.
Concepts: event log, consumer groups/replay, search sync, real-time notifications.

- [ ] Add Kafka (Redpanda) + Elasticsearch to compose
- [ ] Emit `video.ready` event (from outbox) to Kafka
- [ ] `apps/search-service` (NestJS) — Kafka consumer → Elasticsearch indexer
- [ ] `apps/notification-service` (NestJS) — Kafka consumer → WebSocket
- [ ] Search UI (query + autocomplete)
- [ ] AsyncAPI event contract in `libs/ts/contracts`

## Stage 5 — Phase 4: Scale & resilience (kind + Helm + HPA + k6)

Goal: reproduce load, watch the system scale and absorb back-pressure.
Concepts: caching, eventual consistency, back-pressure, autoscaling, load testing.

- [ ] Redis caching (hot metadata) + view counts (eventual consistency)
- [ ] kind cluster + Helm umbrella chart (per-service subcharts)
- [ ] HPA on CPU/memory, then on queue depth
- [ ] k6 load scripts (smoke / cpu / throughput)
- [ ] Windows `ctr import --no-unpack` image-loading script
- [ ] Observe DLQ depth, retries, autoscaling under load

## Stage 6 — Phase 5: Observability (otel-lgtm)

Goal: one trace across the whole pipeline.
Concepts: metrics, traces, logs; context propagation across brokers.

- [ ] Add `grafana/otel-lgtm` to `docker-compose-local-observability.yaml`
- [ ] NestJS OTel SDK + Spring Micrometer OTLP export
- [ ] Context propagation across HTTP + RabbitMQ + Kafka
- [ ] Grafana dashboards; trace one upload end to end
- [ ] `local` vs `local-observability` profile gating

## Stage 7 — Phase 6: Cloud (optional)

Goal: deploy the same open-source tools to AWS.
Concepts: ports/adapters payoff (config swap, not rewrite).

- [ ] EKS deploy target
- [ ] Optional: swap MinIO → S3 via the storage adapter (config change)
- [ ] Verify everything runs with the `aws` environment profile
