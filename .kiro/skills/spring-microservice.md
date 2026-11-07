---
name: spring-microservice
description: Scaffold a Spring Boot 4.1 + Java 21 service with config-as-record, MapStruct/Lombok, and JUnit + MockMvc + ArchUnit + JaCoCo. Use when creating or extending a Java backend service.
---

# Spring Boot Microservice (Java 21)

Standard heavy/JVM service: Spring Boot 4.1 + Java 21, built with Gradle (Kotlin DSL).
Adapted from the reference advanced-starter conventions.

## Choosing the pattern (important)

Match the pattern to the service, not the other way round (see `ADR-011`):

- **Layered MVC** for CRUD-over-DB services (metadata, channels, users), exactly as the
  reference starter: `controller → service (interface + impl) → repository → entity`.
- **Ports & adapters** for infra-heavy services wiring 2+ swappable dependencies —
  notably the **transcoder-service** (object storage, RabbitMQ, Kafka, ffmpeg). Keep the
  domain/use-case logic free of Spring and infra; adapters implement the ports.

```text
transcoder/
├── domain/          # pure logic: TranscodeJob, rendition rules. No Spring, no infra.
├── application/     # use-case services; depend on PORT interfaces only
│   └── port/
│       ├── in/      # driving ports (HandleTranscodeJob)
│       └── out/     # StoragePort, EventPublisherPort, TranscoderPort
└── adapter/
    ├── in/          # RabbitMQ listener (driving adapter)
    └── out/         # MinioStorageAdapter, KafkaEventAdapter, FfmpegAdapter
```

## Principles

- **Config as record, never hardcode.** Bind all config from `application.yaml` into an
  `AppProperties` record (`@ConfigurationProperties`). No magic literals in code.
- **Layering:** controller → service (interface + impl) → repository → entity.
- **Mapping:** MapStruct (`toResponse`, `toEntity`, `updateEntity`). **Boilerplate:** Lombok.
- **Timestamps:** `@PrePersist` / `@PreUpdate` (not Hibernate-specific annotations).
- **DB migrations:** Liquibase changelog (no `ddl-auto` in real profiles).

## Structure

```text
apps/<service>/src/main/java/com/<org>/<service>/
├── <Service>App.java
├── AppProperties.java          # record: all config
├── config/                     # beans, conditional configs
├── controller/
├── service/ + service/impl/
├── repository/
├── entity/
├── dto/request + dto/response/
├── mapper/                     # MapStruct
├── enums/
└── exception/                  # @RestControllerAdvice global handler
```

## Profiles

Mirror the project envs: `local`, `local-observability`, `aws` (+ `test`, `util`).
Conditional beans via `@Profile` / `@ConditionalOnProperty`. Observability beans only in
`local-observability` and `aws`.

## Testing (adopted from the reference starter)

| Layer                 | Tool                                           | Runs on build?               |
| --------------------- | ---------------------------------------------- | ---------------------------- |
| Unit                  | JUnit 5 + Mockito                              | yes (`./gradlew test`)       |
| Controller + security | MockMvc + Spring Security Test (`jwt()`)       | yes                          |
| Architecture rules    | ArchUnit                                       | yes                          |
| API / data injection  | Java built-in `HttpClient`, `@Tag("api-test")` | `./gradlew apiTest` (manual) |
| Coverage              | JaCoCo (75% min)                               | enforced on `build`          |

- Use `@Tag("api-test")` to split fast tests (in build) from integration tests (on-demand).
- Do **not** use REST Assured on JDK 21+ (Groovy NPE issues); use Java `HttpClient`.
- Security tests use `jwt()` post-processor — no real Keycloak needed.
- `@ActiveProfiles("util")` for tests that need no DB/Redis/security.

## Messaging

- RabbitMQ consumer for commands (manual ack, DLQ, prefetch for back-pressure).
- Kafka for emitting/consuming events (consumer groups, offsets).
- Idempotent consumers (see `messaging-patterns`).

## Conventions

- Run JVMs with `-Duser.timezone=Asia/Kolkata`. Postgres 18 rejects the legacy `Asia/Calcutta`
  name that Java reports on Windows. Keep the database itself on UTC.
- Comments follow the `code-comments` skill.
- Internal dependencies resolve via the org Maven repo (configured in Gradle).
- ffmpeg invoked via a thin wrapper class; keep process handling isolated and testable.
- OpenTelemetry via Micrometer tracing → OTLP (see `observability-otel`).
