# Skills Index

Reusable skills live in `.kiro/skills/` (workspace-scoped). Each is a Markdown file with
front-matter (`name`, `description`) so it can be discovered and activated on demand.

Development model: **step by step.** One task at a time, reviewed before moving on. After
every task, a short git commit (see `git-commit-convention`).

---

## Skills in this project

| Skill                          | Purpose                                                                                   | Promote to global?  |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ------------------- |
| `prd-generation`               | Generate a tech-free PRD for any project                                                  | ✅ Global candidate |
| `frontend-react-vite-tailwind` | React 19 + Vite + Tailwind v4, no shadcn (shadcn-like theme), tailwind-styled-components  | ✅ Global candidate |
| `nestjs-microservice`          | NestJS + TS service scaffold (ports/adapters, zod config, Jest + supertest)               | ✅ Global candidate |
| `spring-microservice`          | Spring Boot 4.1 / Java 21 service (MapStruct, Lombok, JUnit + MockMvc + ArchUnit, JaCoCo) | ✅ Global candidate |
| `testing-strategy`             | Test pyramid + coverage gates                                                             | ✅ Global candidate |
| `git-hooks-conventions`        | Husky + lint-staged + commitlint                                                          | ✅ Global candidate |
| `git-commit-convention`        | Short commit after every task (<10 words), conventional format                            | ✅ Global candidate |
| `doc-with-mermaid`             | Author docs in Markdown with Mermaid for architecture/design diagrams                     | ✅ Global candidate |
| `markdown-lint`                | Author Markdown to pass markdownlint rules                                                | ✅ Global candidate |
| `code-comments`                | Minimal, precise comments; skip when names explain; short lines                           | ✅ Global candidate |
| `observability-otel`           | grafana/otel-lgtm + OTLP across Node/Java                                                 | ✅ Global candidate |
| `messaging-patterns`           | RabbitMQ command-queue vs Kafka event-log, outbox, idempotency, DLQ                       | ⬜ Project-specific |
| `k8s-kind-helm`                | kind + Helm + HPA + Windows `ctr import` trick                                            | ⬜ Project-specific |
| `monorepo-pnpm`                | pnpm-workspaces polyglot layout (no Nx)                                                   | ⬜ Project-specific |

---

## Global vs project — the rule

- **Global (`~/.kiro/skills/`):** a recipe you would reuse on an unrelated project
  (PRD generation, the frontend stack recipe, git/testing conventions, doc style).
- **Project (`.kiro/skills/`):** a decision specific to _this_ project's architecture
  (the RabbitMQ+Kafka split, the kind/Helm trick, this monorepo layout).

Currently **everything is kept project-level**. When ready, copy the global candidates to
`~/.kiro/skills/` so they appear in every workspace.

---

## npm tooling that powers these skills (routed via internal registry)

- `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`
- `oxlint`, `prettier`
- `zod` (typed config + event-contract validation)
- `vitest`, `@testing-library/react`, `@playwright/test`
- `dependency-cruiser` (enforce ports/adapters boundaries — the ArchUnit analogue for TS)
- `@asyncapi/cli` (document event-driven contracts — "OpenAPI for queues")
- `tsx`, `concurrently`, `wait-on`, `cross-env`
