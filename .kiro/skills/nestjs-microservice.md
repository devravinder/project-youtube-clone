---
name: nestjs-microservice
description: Scaffold a NestJS + TypeScript microservice with Prisma, zod-validated config, Vitest + supertest, choosing layered-MVC for CRUD services and ports/adapters for infra-heavy services. Use when creating or extending a Node backend service.
---

# NestJS Microservice

Standard Node backend service: NestJS + TypeScript, Prisma, typed config, and a clear test
strategy. Library choices mirror the Spring Boot reference project (see mapping below).

## Choosing the pattern (important)

Match the pattern to the service, not the other way round (see `ADR-011`):

- **Layered MVC** for CRUD-over-DB services (metadata, channels, users):
  `controller → service (interface + impl) → repository (Prisma) → model`.
  Less ceremony, fully adequate.
- **Ports & adapters** for infra-heavy services wiring 2+ swappable dependencies
  (transcoder, search, notification — storage/queue/event-log/ffmpeg/websocket). The
  domain/use-case logic depends only on `*Port` interfaces; adapters implement them, so the
  local↔cloud swap (e.g. MinIO↔S3) is a module binding + config change, not a rewrite.

## Principles

- **Config as typed, validated object.** Parse `process.env` with **zod** into a typed
  config once at startup. Never read `process.env` deep in the code, never hardcode
  (the Node analogue of Spring's `AppProperties` record).
- **DTOs validated with zod** at the controller boundary (`safeParse`, then `BadRequestException`).
  No class-validator, so no decorator-metadata requirement.
- **DI uses explicit `@Inject(Token)`** for every constructor dependency. Services run in dev
  via `tsx`, which does not emit decorator metadata.
- **One S3 adapter serves MinIO and AWS S3.** Only endpoint and credentials differ. Set
  `requestChecksumCalculation: "WHEN_REQUIRED"` so presigned PUT URLs work on real S3.
- **Pick ports that are free on dev machines.** Corporate agents hold some (8081 is taken).
- **DB access via Prisma 7** (type-safe client + Prisma Migrate for schema). Setup notes:
  the connection URL lives in `prisma.config.ts`, not the schema; the generator needs an
  explicit `output` (git-ignored); connect with `@prisma/adapter-pg`; run `prisma generate`
  yourself (migrate no longer does); approve the `prisma` and `@prisma/engines` build scripts.
- **Swagger** auto-generates the OpenAPI docs.

## Library mapping (Spring Boot reference → NestJS)

| Capability         | Spring Boot                              | NestJS (use this)                                                               |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------- |
| Web framework      | spring-boot-starter-webmvc               | `@nestjs/core`, `@nestjs/platform-express`                                      |
| ORM / DB           | spring-data-jpa + Hibernate              | **Prisma** (`prisma`, `@prisma/client`)                                         |
| DB driver          | postgresql                               | `pg` (via Prisma)                                                               |
| Migrations         | Liquibase                                | **Prisma Migrate**                                                              |
| Cache              | spring-boot-starter-cache                | `@nestjs/cache-manager`, `cache-manager`                                        |
| Redis              | spring-boot-starter-data-redis           | `ioredis` (+ cache-manager Redis store)                                         |
| Auth (verify JWT)  | spring-security + oauth2-resource-server | `@nestjs/passport`, `passport-jwt`, `jwks-rsa`                                  |
| OAuth2 client      | oauth2-client                            | `openid-client`                                                                 |
| Keycloak admin     | keycloak-admin-client                    | `@keycloak/keycloak-admin-client`                                               |
| API docs           | springdoc-openapi                        | `@nestjs/swagger`                                                               |
| Validation         | spring-boot-starter-validation           | `class-validator`, `class-transformer`                                          |
| Config (typed)     | AppProperties + @ConfigurationProperties | `@nestjs/config` + **zod**                                                      |
| DTO mapping        | MapStruct                                | plain mapper fns or `@automapper/nestjs`                                        |
| Boilerplate        | Lombok                                   | not needed (TS native)                                                          |
| Metrics            | Actuator + micrometer-prometheus         | `@nestjs/terminus`, `prom-client`, `@willsoto/nestjs-prometheus`                |
| Tracing            | spring-boot-starter-opentelemetry        | `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`          |
| Logging            | loki-logback-appender                    | `nestjs-pino` → OTLP/Loki                                                       |
| Messaging          | (RabbitMQ/Kafka clients)                 | `amqplib` (RabbitMQ) + `@platformatic/kafka` (Kafka; not kafkajs, unmaintained) |
| Search             | spring-data-elasticsearch                | `@elastic/elasticsearch` (major = server major: 8.x for ES 8)                   |
| Architecture tests | ArchUnit                                 | **dependency-cruiser**                                                          |
| Unit/integration   | JUnit 5 + Mockito + MockMvc              | **Vitest** + **supertest**                                                      |
| Coverage gate      | JaCoCo (75%)                             | Vitest `coverage.thresholds` (80%)                                              |
| Formatting         | Spotless                                 | Prettier                                                                        |
| Linting            | spotless/compiler                        | oxlint / ESLint                                                                 |
| Git hooks          | Husky + lint-staged + commitlint         | Husky + lint-staged + commitlint (same)                                         |

All packages resolve via the org registry (configured in the developer's npm settings; not
committed to the repo).

## Structure — layered MVC (CRUD service)

```text
apps/<service>/
├── prisma/schema.prisma
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/            # zod schema + typed config provider
│   ├── prisma/            # PrismaService (module)
│   └── <feature>/
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts        # interface
│       ├── <feature>.service.impl.ts   # uses PrismaService
│       └── dto/
└── test/                  # *.spec.ts (unit), *.e2e-spec.ts (supertest)
```

## Structure — ports & adapters (infra-heavy service)

```text
apps/<service>/
├── src/
│   ├── domain/            # pure logic, no framework/infra
│   ├── application/
│   │   ├── <usecase>.service.ts
│   │   └── port/
│   │       ├── in/        # driving ports (handlers)
│   │       └── out/       # StoragePort, EventPublisherPort, ...
│   └── adapter/
│       ├── in/            # rabbitmq.listener.ts, http.controller.ts
│       └── out/           # minio.adapter.ts, kafka.adapter.ts, s3.adapter.ts
└── test/
```

## Config with zod

```ts
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().url(),
  STORAGE_ENDPOINT: z.string().url(),
  RABBITMQ_URL: z.string(),
  KAFKA_BROKERS: z.string(),
});

export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (): AppConfig => schema.parse(process.env);
```

## Port + adapter (infra-heavy service)

```ts
export interface StoragePort {
  presignedPut(key: string): Promise<string>;
  getObjectUrl(key: string): string;
}

// adapter/out/minio.adapter.ts implements StoragePort
// adapter/out/s3.adapter.ts    implements StoragePort
// bound in the module by env (local -> minio, aws -> s3)
```

## Testing

- **Unit:** Vitest (not Jest: `ts-jest` rejects TypeScript 7 and Jest needs ESM flags). Test
  services directly with in-memory fakes of the ports and of the Prisma calls they use
  (`src/testing/`). Fast, no infra.
- **Controller/e2e:** `Test.createTestingModule` + supertest over real HTTP, real controllers and
  services, fakes underneath, and a header-driven stand-in for the auth guard.
- **Auth guard:** sign real JWTs with `jose` and serve a JWKS from a local `http` server; cover
  expired, wrong audience, wrong issuer and unknown-key tokens. No Keycloak needed.
- **Contract:** one test fails when `contracts/*.openapi.json` differs from what the code generates.
- Vitest needs `oxc: { decorator: { legacy: true } }`; explicit `@Inject(token)` means no
  decorator metadata is required.
- **Architecture boundaries:** `dependency-cruiser` — application/use-case may depend on
  ports, never on adapters directly (the ArchUnit analogue for TS).
- Coverage gate 75% in CI/pre-commit.

## API contract (OpenAPI)

Every endpoint is documented with explicit Zod-backed schemas and published as OpenAPI 3.1;
see `openapi-contracts`. Define request and response schemas in the DTO file with `.meta({ id })`,
derive types with `z.infer`, and regenerate with `pnpm api:generate` after any API change.

## Large uploads (multipart)

Never proxy big files through the service. Put multipart operations on the storage port
(`createMultipartUpload`, `createPresignedPartUrl`, `listUploadedParts`, `completeMultipartUpload`,
`abortMultipartUpload`) and keep ETag handling inside the adapter, so the browser needs no CORS
header access. Store `uploadId`, `partSize` and `partCount` on the row. Complete only when every planned part is stored with exactly the planned size (store the declared file size), make abort idempotent (treat `NoSuchUpload` as success), and abort
multipart uploads in the cleanup job. See ADR-020.

## Redis (cache + counters)

- Client: `redis` (node-redis, official). `disableOfflineQueue: true`, and wrap every call in a guard that
  races its own timer (500 ms) and then skips Redis for a cool-down. node-redis's `timeout` option only
  covers queueing; a paused or hung Redis keeps the socket open and would block requests.
- Tell "not sent" (unavailable: safe to fall back) from "sent, no answer" (timeout: may still apply; do
  not also write the fallback or you double count).
- Cache-aside the DB row (not responses with signed URLs), short TTL, evict after commit on every write.
- Counters: one Lua script for check-and-increment, a dirty set plus `SPOP`/`GETDEL` for multi-instance
  flushing, no TTL on counters, `maxmemory-policy volatile-lru`.
- Integration specs use their own Redis database (`/15`) and skip when Redis is not reachable.

## Kafka consumer service (search-service pattern)

- Split three ways: a pure `handleX(value, typeHeader, port)` that returns an outcome (indexed / stale /
  skipped / dead-letter) and throws on infrastructure errors; an `EventProcessor` that retries throws with
  backoff, dead-letters bad input and commits; and a thin `Kafka*` class that only wires
  `Consumer`/`Producer`. Unit-test the first two with fakes; cover the wiring end to end.
- `mode: "committed"`, `fallbackMode: "earliest"`, `autocommit: false`; commit after handling. Process one
  message at a time (`for await`) to keep partition order.
- Start the consume loop from `onApplicationBootstrap` without awaiting it, so HTTP serves while a broker
  is down. On shutdown stop the processor, close the stream, then await the loop.
- Idempotent writes (upsert by entity id plus an external version) instead of a processed-ids table.
- Coverage gate: exclude the broker wiring file, as with the AMQP adapters.

## Conventions

- Comments follow the `code-comments` skill.
- API changes update `http/<service>.http` (see `api-http-requests`).
- Native `fetch` for outbound HTTP (no axios unless needed).
- Structured logging + OpenTelemetry (see `observability-otel`).
- Idempotent queue consumers (see `messaging-patterns`).
- Internal packages resolve via the org registry (developer's npm settings; not committed).

## Database scripts

Keep the set small. Each service with a database defines `db:generate`, `db:migrate` and `db:reset`
in its own `package.json`, and the root runs them for every service with
`pnpm -r --if-present db:<action>`. `db:reset` must call `scripts/assert-local-db.mjs` first so it
can never run against a remote database. Outside local development use `prisma migrate deploy`
directly (for example in a Kubernetes job), never `db:migrate`. Add another script only when it is
used often.
