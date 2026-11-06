---
name: spring-microservice
description: Scaffold a Spring Boot 4.1 + Java 21 service with config-as-record, MapStruct/Lombok, and JUnit + MockMvc + ArchUnit + JaCoCo. Use when creating or extending a Java backend service.
---

# Spring Boot Microservice (Java 21)

Standard heavy/JVM service: Spring Boot 4.1 + Java 21, built with Gradle (Kotlin DSL).
Adapted from the reference advanced-starter conventions.

## Principles

- **Config as record, never hardcode.** Bind all config from `application.yaml` into an
  `AppProperties` record (`@ConfigurationProperties`). No magic literals in code.
- **Layering:** controller → service (interface + impl) → repository → entity.
- **Mapping:** MapStruct (`toResponse`, `toEntity`, `updateEntity`). **Boilerplate:** Lombok.
- **Timestamps:** `@PrePersist` / `@PreUpdate` (not Hibernate-specific annotations).
- **DB migrations:** Liquibase changelog (no `ddl-auto` in real profiles).

## Structure

```
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

| Layer | Tool | Runs on build? |
|-------|------|----------------|
| Unit | JUnit 5 + Mockito | yes (`./gradlew test`) |
| Controller + security | MockMvc + Spring Security Test (`jwt()`) | yes |
| Architecture rules | ArchUnit | yes |
| API / data injection | Java built-in `HttpClient`, `@Tag("api-test")` | `./gradlew apiTest` (manual) |
| Coverage | JaCoCo (75% min) | enforced on `build` |

- Use `@Tag("api-test")` to split fast tests (in build) from integration tests (on-demand).
- Do **not** use REST Assured on JDK 21+ (Groovy NPE issues); use Java `HttpClient`.
- Security tests use `jwt()` post-processor — no real Keycloak needed.
- `@ActiveProfiles("util")` for tests that need no DB/Redis/security.

## Messaging

- RabbitMQ consumer for commands (manual ack, DLQ, prefetch for back-pressure).
- Kafka for emitting/consuming events (consumer groups, offsets).
- Idempotent consumers (see `messaging-patterns`).

## Conventions

- Internal dependencies resolve via the org Maven repo (configured in Gradle).
- ffmpeg invoked via a thin wrapper class; keep process handling isolated and testable.
- OpenTelemetry via Micrometer tracing → OTLP (see `observability-otel`).
