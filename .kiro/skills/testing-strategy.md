---
name: testing-strategy
description: Apply a consistent test pyramid with coverage gates across Node (Jest/Vitest/supertest/Playwright) and Java (JUnit/MockMvc/ArchUnit/JaCoCo), plus k6 load tests. Use when adding or organizing tests.
---

# Testing Strategy

A consistent test pyramid across the polyglot stack, adapted from the reference
advanced-starter. Fast tests run on build; slow/integration tests run on demand.

## Pyramid

| Layer                  | Node                                                  | Java                                     |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Unit                   | Jest (services) / Vitest (frontend) + Testing Library | JUnit 5 + Mockito                        |
| Component / controller | supertest against Nest app                            | MockMvc + Spring Security Test (`jwt()`) |
| Architecture rules     | dependency-cruiser                                    | ArchUnit                                 |
| Integration / API      | supertest against running app (tagged)                | Java `HttpClient`, `@Tag("api-test")`    |
| E2E (browser)          | Playwright                                            | —                                        |
| Load / performance     | k6                                                    | k6                                       |
| Coverage gate          | Vitest/Jest threshold                                 | JaCoCo (75% min)                         |

## Rules

- **Fast tests in the build, slow tests on demand.** Tag integration/API tests
  (`@Tag("api-test")` in Java; a separate script/filter in Node) so `test` stays fast.
- **No real infra in unit tests.** Mock ports/adapters.
- **Security tests without a real IdP:** use `jwt()` post-processor (Java) / a fake token
  provider (Node). No live Keycloak needed for controller tests.
- **Do not use REST Assured on JDK 21+** (Groovy NPE). Use Java built-in `HttpClient`.
- **Playwright, not Selenium**, for E2E (auto-wait, faster, SPA-friendly).
- **Idempotency/retry tests** for queue consumers — simulate duplicate delivery and failure.

## Coverage

- Backend Java: JaCoCo, 75% min, enforced on `build`. Exclude DTOs/entities/mappers/config.
- Frontend/Node: Vitest/Jest threshold, enforced on pre-commit.

## Load testing (k6) — tied to scaling lessons

- `smoke-test.js`, `cpu-load.js`, and queue-depth/throughput scenarios.
- Default target the k8s ingress; `--env BASE_URL=...` for local.
- Use load tests to **observe HPA scaling** and queue back-pressure (see `k8s-kind-helm`).

## Commands (convention)

```bash
# Node
pnpm --filter <app> test           # unit
pnpm --filter <app> test:e2e       # Playwright
# Java
./gradlew test                     # unit + controller + ArchUnit
./gradlew apiTest                  # tagged integration (running app)
./gradlew build                    # + JaCoCo gate
# Load
k6 run load-testing/smoke-test.js
```

## Contract checks

Run `pnpm api:check` in CI so the committed OpenAPI spec and generated client types always match the
code. Behaviour is covered by the `http/` requests.
