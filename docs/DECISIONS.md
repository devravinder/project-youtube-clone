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
variable design tokens). Reusable components via tailwind-styled-components.

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
