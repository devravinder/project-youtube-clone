---
name: testing-strategy
description: Apply a consistent test pyramid with coverage gates across Node (Vitest/supertest/Testing Library/Playwright) and Java (JUnit/MockMvc/ArchUnit/JaCoCo), plus k6 load tests. Use when adding or organizing tests.
---

# Testing Strategy

A consistent test pyramid across the polyglot stack, adapted from the reference
advanced-starter. Fast tests run on build; slow/integration tests run on demand.

## Pyramid

| Layer                  | Node                                             | Java                                     |
| ---------------------- | ------------------------------------------------ | ---------------------------------------- |
| Unit                   | Vitest (services and frontend) + Testing Library | JUnit 5 + Mockito                        |
| Component / controller | supertest against Nest app                       | MockMvc + Spring Security Test (`jwt()`) |
| Architecture rules     | dependency-cruiser                               | ArchUnit                                 |
| Integration / API      | supertest against running app (tagged)           | Java `HttpClient`, `@Tag("api-test")`    |
| E2E (browser)          | Playwright                                       | —                                        |
| Load / performance     | k6                                               | k6                                       |
| Coverage gate          | Vitest `coverage.thresholds` (80% lines)         | JaCoCo (75% min)                         |

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
- Node: Vitest thresholds (80% lines/functions, 70% branches) on the code that holds logic. Run `pnpm test:coverage` in CI; pre-commit stays fast and does not run tests.

## Node test conventions

- One runner, Vitest, for backend and web: `pnpm test` (all), `pnpm test:coverage` (gates).
- Specs sit beside the code (`*.spec.ts` backend, `*.test.ts(x)` web); shared fakes live in
  `src/testing/` (backend). Reset shared fakes in `beforeEach`; do not hardcode ids that depend on
  test order.
- Fake only what the code calls (`FakeStorage`, `FakePrisma`), and make fakes behave like the real
  thing where it matters (storage throws `NoSuchUpload` for a finished upload).
- Use fake timers for backoff and retry tests, and separate "healthy but slow" from "failing" cases.
- **Prove tests can fail.** After writing tests for important logic, break the code on purpose
  (skip the owner check, drop a retry, ignore a limit) and confirm a test fails. A surviving mutation
  means a missing test.
- Test through the public edge: HTTP for controllers, the exported function for services; avoid
  asserting on private helpers.
- Web: mock the module boundary (`vi.mock("./api")`, the auth library), not `fetch` internals,
  except in the test for the API client itself. Files under test must really cross the size
  thresholds of the code (a "large" upload test needs a file over 16 MiB).

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
