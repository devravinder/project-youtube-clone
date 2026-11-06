---
name: nestjs-microservice
description: Scaffold a NestJS + TypeScript microservice with Prisma, zod-validated config, Jest + supertest, choosing layered-MVC for CRUD services and ports/adapters for infra-heavy services. Use when creating or extending a Node backend service.
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
- **DTOs validated** with `class-validator` / `class-transformer` at the boundary.
- **DB access via Prisma** (type-safe client + Prisma Migrate for schema).
- **Swagger** auto-generates the OpenAPI docs.

## Library mapping (Spring Boot reference → NestJS)

| Capability | Spring Boot | NestJS (use this) |
|---|---|---|
| Web framework | spring-boot-starter-webmvc | `@nestjs/core`, `@nestjs/platform-express` |
| ORM / DB | spring-data-jpa + Hibernate | **Prisma** (`prisma`, `@prisma/client`) |
| DB driver | postgresql | `pg` (via Prisma) |
| Migrations | Liquibase | **Prisma Migrate** |
| Cache | spring-boot-starter-cache | `@nestjs/cache-manager`, `cache-manager` |
| Redis | spring-boot-starter-data-redis | `ioredis` (+ cache-manager Redis store) |
| Auth (verify JWT) | spring-security + oauth2-resource-server | `@nestjs/passport`, `passport-jwt`, `jwks-rsa` |
| OAuth2 client | oauth2-client | `openid-client` |
| Keycloak admin | keycloak-admin-client | `@keycloak/keycloak-admin-client` |
| API docs | springdoc-openapi | `@nestjs/swagger` |
| Validation | spring-boot-starter-validation | `class-validator`, `class-transformer` |
| Config (typed) | AppProperties + @ConfigurationProperties | `@nestjs/config` + **zod** |
| DTO mapping | MapStruct | plain mapper fns or `@automapper/nestjs` |
| Boilerplate | Lombok | not needed (TS native) |
| Metrics | Actuator + micrometer-prometheus | `@nestjs/terminus`, `prom-client`, `@willsoto/nestjs-prometheus` |
| Tracing | spring-boot-starter-opentelemetry | `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node` |
| Logging | loki-logback-appender | `nestjs-pino` → OTLP/Loki |
| Messaging | (RabbitMQ/Kafka clients) | `amqplib` (RabbitMQ) + `kafkajs` (Kafka) |
| Architecture tests | ArchUnit | **dependency-cruiser** |
| Unit/integration | JUnit 5 + Mockito + MockMvc | **Jest** + **supertest** |
| Coverage gate | JaCoCo (75%) | Jest `coverageThreshold` (75%) |
| Formatting | Spotless | Prettier |
| Linting | spotless/compiler | oxlint / ESLint |
| Git hooks | Husky + lint-staged + commitlint | Husky + lint-staged + commitlint (same) |

All packages resolve via the org registry (configured in `.npmrc`; not documented here).

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

- **Unit:** Jest; mock ports (infra-heavy) or mock PrismaService (CRUD). Fast, no infra.
- **Controller/e2e:** supertest against the Nest app.
- **Architecture boundaries:** `dependency-cruiser` — application/use-case may depend on
  ports, never on adapters directly (the ArchUnit analogue for TS).
- Coverage gate 75% in CI/pre-commit.

## Conventions

- Native `fetch` for outbound HTTP (no axios unless needed).
- Structured logging + OpenTelemetry (see `observability-otel`).
- Idempotent queue consumers (see `messaging-patterns`).
- Internal packages resolve via the org registry (configured in `.npmrc`).
