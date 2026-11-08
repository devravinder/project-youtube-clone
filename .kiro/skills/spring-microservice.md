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

## Bootstrapping

Generate the project at <https://start.spring.io> (Gradle Kotlin DSL, Java 21, the current GA Boot) so the
wrapper and build files are valid, then reshape it. Boot 4 starter names differ from Boot 3: web is
`spring-boot-starter-webmvc`, and tests use `spring-boot-starter-*-test`. Pin plugin and library versions.
Expose a `package.json` shim whose scripts call `scripts/gradle.mjs`, so root `pnpm test` and
`pnpm start:l:<service>` cover Java too. Build with `gradlew build`; the first run downloads Gradle.

## Conventions from the reference starter

- **Versions:** `gradle/libs.versions.toml`; build files use `alias(libs.plugins.x)` and `libs.x`. Pin non-BOM
  versions (MapStruct 1.6.3, lombok-mapstruct-binding 0.2.0); let the Boot BOM manage Lombok.
- **Annotation processors, in this order:** configuration-processor, `mapstruct-processor`, then `lombok` and
  `lombok-mapstruct-binding`. Add `lombok.config` with `lombok.addLombokGeneratedAnnotation = true`.
- **Config:** one `@Validated @ConfigurationProperties(prefix = "app") record AppProperties` with nested
  records, `@NotBlank` on strings, registered with `@ConfigurationPropertiesScan`. Inject it by constructor.
- **Profiles:** `application.yaml` plus `application-<profile>.yaml` for `local`, `local-observability`, `aws`.
  Base file: structure and `${ENV:default}` placeholders, no secret defaults. Required values use an empty
  default (`${X:}`), because an unresolved `${X}` binds as literal text and passes validation.
  `spring.profiles.active: ${SPRING_PROFILES_ACTIVE:local}`; `local-observability` is a group including `local`.
- **Lombok:** `@RequiredArgsConstructor` with `private final` fields for injection, `@Slf4j` for logging
  (`log.info("... {}", value)`). Records for config and domain values; `@Getter/@Setter/@Builder` only on
  mutable DTOs or entities. No `@Data`.
- **MapStruct:** interfaces with `@Mapper(componentModel = "spring")`, methods named `toX`/`toEntity`/
  `updateEntity`, `@MappingTarget` for updates, explicit `ignore = true` for target-only fields.
- **Tests for config:** `ApplicationContextRunner` for binding and validation; start the app with
  `--spring.profiles.active=<profile>` to check each profile, including that `aws` fails without its variables.
- **Formatting:** Spotless with `cleanthat`, `removeUnusedImports`, `importOrder`, `formatAnnotations`,
  `googleJavaFormat`, `trimTrailingWhitespace`, `endWithNewline` on `src/**/*.java`; pin the formatter versions
  in the catalog. `compileJava` depends on `spotlessApply`; CI runs `spotlessCheck`.

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

## API contract (OpenAPI)

Expose the spec with springdoc-openapi and commit the export to `contracts/<service>.openapi.json`;
see `openapi-contracts`.

## Conventions

- Run JVMs with `-Duser.timezone=Asia/Kolkata`. Postgres 18 rejects the legacy `Asia/Calcutta`
  name that Java reports on Windows. Keep the database itself on UTC.
- Comments follow the `code-comments` skill.
- API changes update `http/<service>.http` (see `api-http-requests`).
- Internal dependencies resolve via the org Maven repo (configured in Gradle).
- ffmpeg invoked via a thin wrapper class; keep process handling isolated and testable.
- OpenTelemetry via Micrometer tracing → OTLP (see `observability-otel`).

## Ports-and-adapters checks

- Keep `domain` and `application` free of Spring and `jakarta`; use records, plain classes and JDK APIs.
  Wire the application service into Spring in an adapter or config class, never with annotations on it.
- Enforce the layering with ArchUnit (`noClasses().that().resideInAPackage(...).should().dependOnClassesThat()`).
  Add `.allowEmptyShould(true)` to rules about packages that have no classes yet, or they fail.
- Test application services with hand-written fake ports (no Spring, no Mockito) and a `@TempDir`.
- Gate coverage with JaCoCo (`minimum = 0.75`, main class excluded), and let `test` finish with
  `jacocoTestReport` so the report always exists.
- After writing tests, break the code on purpose (drop the cleanup, skip a rule) and confirm a test fails.

## IntelliJ run configs

Commit `apps/<service>/.run/<Main>.sample.run.xml` (Spring Boot type, the `<project>.main` module, active
profile `local`, every env var with its local value) and git-ignore `.run/*.run.xml` except
`!.run/*.sample.run.xml`. Give the sample its own configuration name (`<Main> (sample)`) so a personal copy
named `<Main>` can sit next to it. Use the same env names as the Node services (`STORAGE_*`) and Spring's own
names where they exist (`SPRING_RABBITMQ_*`). Add every new env var to the sample in the same task.
