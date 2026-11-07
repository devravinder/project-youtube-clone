# Architecture Decision Log

A running log of meaningful decisions and reviews. Newest entries at the bottom.
Each entry: what we decided, why, and any trade-off or alternative considered.

Format: `## ADR-NNN — <title>` · Date · Status (Accepted / Superseded / Proposed)

---

## ADR-001 — Open-source-first; cloud only where it is the standard

Date: 2026-11-06 · Status: Accepted

Use the widely-adopted open-source container for each capability (MinIO, RabbitMQ, Kafka,
Elasticsearch, Redis, Postgres, nginx, ffmpeg, Keycloak, otel-lgtm). Reach for a cloud
service only when it is itself the industry standard with no OSS substitute worth learning.

AWS appears only as a deploy target: **EKS**, and optionally real **S3** (zero-code adapter
swap from MinIO). Nothing else.

Why: the goal is learning the real mechanics, not managed magic. OSS tools expose acks,
offsets, cache headers, and segmenting that managed services hide.

## ADR-002 — Messaging: RabbitMQ (commands) + Kafka (events), phased

Date: 2026-11-06 · Status: Accepted

Use both, deliberately: RabbitMQ for the "transcode this video" command (work-queue:
ack/DLQ/prefetch/back-pressure), Kafka for the "video.ready" event (log: partitions,
consumer groups, replay). Introduce RabbitMQ first (Phase 1), Kafka later (Phase 3) when a
second consumer makes the need concrete.

Alternative considered: Kafka-only (fewer moving parts) — rejected because experiencing
command-queue vs event-log side by side is a core learning objective.

## ADR-003 — Backend: NestJS for API/light services, Spring Boot for heavy

Date: 2026-11-06 · Status: Accepted

NestJS + TypeScript for the API/BFF and light services (DI container cleanly supports
ports/adapters). Spring Boot 4.1 + Java 21 for the transcoding worker (long-running JVM
workload, strong ffmpeg/queue ecosystem). Polyglot on purpose: forces language-agnostic
contracts (events, REST).

Not Next.js for the API: Next.js is a frontend framework; its API routes are ill-suited to
WebSockets, queue consumers, and hexagonal DI.

## ADR-004 — Frontend: React 19 + Vite + Tailwind v4, no shadcn

Date: 2026-11-06 · Status: Accepted

React 19 + TypeScript + Vite + Tailwind v4. No shadcn, but a shadcn-like theme (CSS
variable design tokens). Reusable components via tailwind-variants (amended by ADR-014).

## ADR-005 — Monorepo: pnpm workspaces, no Nx

Date: 2026-11-06 · Status: Accepted

pnpm workspaces for the JS side; Gradle multi-project for Java. No Nx — the goal is system
design, not build tooling. Revisit only if task-graph/caching pain becomes real.

## ADR-006 — Identity: Keycloak

Date: 2026-11-06 · Status: Accepted

Keycloak as the OIDC identity service (matches the reference starter, industry-standard,
and the container is available). Rust alternatives (Rauthy, Kanidm) and ZITADEL (Go) were
discussed; not adopted — auth should be a boring, solved dependency behind an OIDC adapter.

## ADR-007 — Observability: single grafana/otel-lgtm container

Date: 2026-11-06 · Status: Accepted

Use the all-in-one `grafana/otel-lgtm` image (Loki + Grafana + Tempo + Prometheus + OTLP
collector) instead of the reference starter's 5-container stack. All services export OTLP to
`:4318`. Pyroscope dropped (Linux-only, flaky on Windows; not needed).

## ADR-008 — Environments: local, local-observability, aws

Date: 2026-11-06 · Status: Accepted

Three environments. `local` (minimal infra, observability off), `local-observability` (adds
otel-lgtm, sampling 1.0), `aws` (EKS deploy target).

Dropped: `localstack` (redundant once we use real OSS tools instead of AWS services) and the
fully-containerized `docker` env (kind covers it).

## ADR-009 — Spec-driven workflow: Kiro Specs + this decision log

Date: 2026-11-06 · Status: Accepted

Use Kiro's native Spec workflow per feature (`requirements.md` / `design.md` / `tasks.md`)
instead of hand-rolled spec.md/plan.md. Use this `DECISIONS.md` as the review/decision log
instead of a review.md. Development proceeds step by step, one task at a time, reviewed
before moving on.

## ADR-010 — Skills: project-level now, promote to global later

Date: 2026-11-06 · Status: Accepted

Keep all skills in `.kiro/skills/` (workspace) for now. `docs/SKILLS.md` records which are
good candidates to promote to `~/.kiro/skills/` (user-level, available in every project).

## ADR-011 — Pattern per service: layered MVC for CRUD, ports & adapters for infra-heavy

Date: 2026-11-06 · Status: Accepted

Do not force one pattern across all services. Choose by the service's shape:

- **Layered MVC** for CRUD-over-DB services (metadata, channels, users), matching the
  reference starter: controller → service (interface + impl) → repository → model/entity.
  Hexagonal adds ceremony with little payoff when the only dependency is the database.
- **Ports & adapters (pragmatic hexagonal)** for services wiring 2+ swappable infrastructure
  dependencies — notably the **transcoder-service** (MinIO/S3 storage, RabbitMQ, Kafka,
  ffmpeg), and leaning that way for search and notification services. Domain/use-case logic
  depends only on `*Port` interfaces; adapters implement them.

Why: the MinIO↔S3 swap and unit-testing infra-heavy logic without live infra are explicit
project goals that hexagonal serves; CRUD services gain nothing from the extra layers.
Applies to both Spring Boot and NestJS services.

## ADR-012 — NestJS stack mirrors the Spring Boot reference; Prisma for DB

Date: 2026-11-06 · Status: Accepted

NestJS services use libraries that mirror the Spring Boot reference project's capabilities
(see `nestjs-microservice` skill for the full mapping): `@nestjs/config` + zod (typed
config, the `AppProperties` analogue), `@nestjs/swagger` (OpenAPI), `class-validator`
(validation), Passport + `jwks-rsa` (Keycloak JWT), cache-manager + ioredis (cache/Redis),
`prom-client` + OpenTelemetry (observability), Jest + supertest (tests), dependency-cruiser
(the ArchUnit analogue), Prettier + oxlint, Husky + lint-staged + commitlint.

Database: **Prisma** (type-safe client + Prisma Migrate as the Liquibase analogue), chosen
over TypeORM for the cleaner migration story and type safety.

## ADR-013 — Image versions follow availability; Kafka is Bitnami 3.5.1

Date: 2026-11-06 · Status: Accepted

Container tags are the versions actually obtainable in our environment, listed in
`docs/IMAGES.md`. Where this conflicts with "use the latest" (ADR-012 dependency policy),
availability wins: Kafka `bitnami/kafka:3.5.1` (KRaft, no ZooKeeper), Elasticsearch
`8.19.16`, Redis `6.2.24`, RabbitMQ `3.12.13-management`, otel-lgtm `1.3`.

Redpanda and `apache/kafka` were not available. Bitnami Kafka is upstream Apache Kafka, so
`kafkajs` and Spring Kafka clients behave identically. Kafka UI and RedisInsight are
dropped; the CLIs inside the containers are used instead.

Compose files use plain image names so they stay portable. Images pulled from a private
registry are tagged to those names with `infra/retag-images.ps1`, which takes the registry
from the `IMAGE_REGISTRY` environment variable.

## ADR-014 — Reusable UI components: tailwind-variants, not tailwind-styled-components

Date: 2026-11-07 · Status: Accepted (amends ADR-004)

Reusable components use `tailwind-variants` with `tailwind-merge`, as plain React function
components typed with `ComponentProps<"element">`. Video uses `react-player`, which plays MP4
now and lazy-loads HLS and DASH support for the streaming phase.

Why not tailwind-styled-components: the last release was September 2022, it only
concatenates classes so `className` overrides are unreliable, and under React 19 it lost
event-handler typing (three `implicit any` errors in the first build of the upload form).

Alternatives considered: `react-twc` (closest template syntax, last release July 2025),
`class-variance-authority` (stable, fewer features), `@tw-classed/react`.
