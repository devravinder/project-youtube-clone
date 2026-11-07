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

## ADR-015 — Server state with TanStack Query; no global client-state library

Date: 2026-11-07 · Status: Accepted

All server data in the web app goes through `@tanstack/react-query`: infinite scrolling with
`useInfiniteQuery` over a cursor-paginated API, details with `useQuery`, and uploads with
`useMutation` that invalidates the cached lists on success.

No Redux, Zustand or similar is added. State already has natural homes: server data in the
query cache, location in the URL, form fields in local component state, and the theme in the
`<html>` class plus `localStorage`. The first likely triggers for a store are the signed-in
user (a React context is enough to start), an upload that must survive navigation, and
live notification counts from the notification service.

Consequence worth remembering: presigned playback URLs differ on every fetch, so the video
detail query uses a long `staleTime` and no focus refetch to keep the player from restarting.

## ADR-016 — Icons: lucide-react

Date: 2026-11-07 · Status: Accepted

All icons come from `lucide-react` (1.61.0), imported by name so unused icons are tree-shaken.
Hand-drawn inline SVG components are removed.

Why: it is actively maintained (published the day before this decision), declares React 19
support, has a consistent stroke style, and is the icon set shadcn/ui uses, which fits the
shadcn-like theme. Tabler (5,000+ icons) is the fallback for a missing glyph. Phosphor was
passed over because its last release was May 2025; react-icons mixes unrelated styles;
Heroicons has a small set.

## ADR-017 - JWT verification with jose

Date: 2026-11-07 - Status: Accepted

Services verify Keycloak access tokens themselves with `jose`: `createRemoteJWKSet` fetches and
caches the realm's public keys, and `jwtVerify` checks the signature, issuer, audience and
expiry. A Nest `AuthGuard` does this per request and exposes the user through `@CurrentUser()`.

Why not Passport + `jwks-rsa` (the earlier plan in ADR-012): `jose` does the same job in one
package with no strategy layer, and it works the same way in plain Node and in other services.

Rules: reads stay public; upload endpoints need a token; a video records its `ownerId`
(the token `sub`) and only the owner can confirm it. Stateless verification means no call to
Keycloak per request, the trade-off being that a revoked token stays valid until it expires.

## ADR-018 - Web sign-in with oidc-client-ts

Date: 2026-11-07 - Status: Accepted

The web app signs in with `oidc-client-ts` (3.5.0) wrapped by `react-oidc-context` (3.3.1):
authorization code flow with PKCE against the public Keycloak client `yt-web`. No client
secret exists in the browser. Tokens live in `sessionStorage`, so they vanish with the tab.

Guards: a `RequireAuth` route wrapper sends anonymous visitors of `/upload` to Keycloak and
returns them to the page afterwards. The upload action checks for a token too, and a 401 from
the API triggers the same redirect, so an expired session mid-flow also lands on login.
Browsing and watching stay public. The signed-in user is read through the auth context, as
ADR-015 anticipated; no store is added.

Trade-offs: `sessionStorage` tokens are readable by any script on the page, so XSS is the
main risk; a backend-for-frontend with cookies would avoid that and is out of scope here.
The chosen file is lost when a redirect to login happens.

## ADR-019 - OpenAPI contracts generated from Zod, types via openapi-typescript

Date: 2026-11-07 - Status: Accepted

Each service publishes an OpenAPI 3.1 spec generated from its own code. The Zod schemas that
validate requests also produce the spec (`z.toJSONSchema` over schemas tagged with
`.meta({ id })`), `@nestjs/swagger` collects routes and operations, and Swagger UI is served at
`/docs`. The spec is committed to `contracts/` and the web app generates its API types from it
(`pnpm api:generate`). To avoid a manual step the service rewrites the spec when it starts in a non-deployed env, the web `dev` script regenerates types from it, a pre-commit hook regenerates and stages both when service code changes, and `pnpm api:check` fails CI on drift. A generate-from-the-live-URL flow was tried and rejected: nothing reviewable in git and CI could not regenerate without a running service.

Why `openapi-typescript` and not `@openapitools/openapi-generator-cli`: the latter needs a JDK
and emits classes plus HTTP glue that must be reviewed and maintained; the former emits only
`.d.ts` types, in pure Node. It needs the TypeScript 5 compiler API, which TypeScript 7 lacks,
so it runs through `pnpm dlx` with a pinned version and its own TS 5.

Why not `nestjs-zod`: it supports Nest up to 11 only. Why not `@nestjs/swagger` decorators on
DTO classes: tsx emits no decorator metadata and the DTOs are Zod schemas, so classes would
duplicate every rule. Trade-off: each endpoint needs explicit documentation decorators, and a
forgotten one means a missing response in the spec; `api:check` plus the `http/` tests catch
most of that.

## ADR-020 - Large uploads: S3 multipart with presigned part URLs

Date: 2026-11-07 - Status: Accepted

Files over 16 MiB upload in parts; smaller files keep the single presigned PUT. The server
starts a multipart upload (`POST /uploads/multipart`), stores `uploadId`, `partSize` and
`partCount` on the video, and hands out presigned URLs per part (`POST /uploads/:id/parts`).
The browser slices the `File`, uploads 3 parts in parallel straight to storage, retries a part up
to 3 times with backoff (a 403 means an expired URL, so a fresh one is fetched), and then calls
`complete`. Parts are 8 MiB (minimum 5 MiB, enforced by storage) and grow for huge files so the
10,000-part limit is never hit.

The server, not the browser, joins the parts: the S3 adapter lists the stored parts and sends
their ETags itself. The browser never reads ETags, so no `ExposeHeaders` CORS setup is needed on
the bucket, and `complete` fails with 409 unless every planned part is present.

Resume: `GET /uploads/:id/parts` lists what storage already holds. The page remembers the video
id per file (`name:size:lastModified`) in `localStorage`; uploading the same file again skips parts
whose size matches. Cancel calls `DELETE /uploads/:id`, which aborts the multipart upload and
removes the row. The abandoned-upload job also aborts expired multipart uploads, because stored
parts are billed and invisible in normal listings.

Trade-offs: parts are not checksum-verified (S3 `ChecksumSHA256` per part would add that), and
`complete` checks the part count, not the total size. Resume relies on `localStorage`, so it works
per browser and not across devices.

## ADR-021 - Tests: Vitest everywhere, with in-memory fakes

Date: 2026-11-07 - Status: Accepted (replaces the test runner named in ADR-012)

Both the backend and the web app use Vitest 5; the backend adds `@nestjs/testing` and supertest,
the web app adds jsdom and Testing Library. ADR-012 had planned Jest for services.

Why not Jest: `ts-jest` declares `typescript <7` and we are on TypeScript 7.0.2, so Jest would need
an swc transform plus ESM flags. Vitest runs our ESM TypeScript as is, shares Vite with the web app,
and one runner means one set of conventions. Decorators work through
`oxc: { decorator: { legacy: true } }`; explicit `@Inject(token)` means no emitted metadata.

Approach: unit and controller tests use in-memory fakes of the storage port and of the Prisma calls
the services make, so they run in seconds without Docker. JWT verification is tested with real signed
tokens against a local JWKS server. A test compares the committed OpenAPI file with the code. The
`.http` suite and the browser run remain the checks against real infrastructure.

Trade-off: a fake can drift from the real database or storage. `FakePrisma` implements only the
queries the services use; if a service starts using a new query, the fake must grow with it, and the
`.http` suite is what catches a mismatch with real Postgres.
