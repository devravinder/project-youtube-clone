---
name: monorepo-pnpm
description: Structure a polyglot monorepo with pnpm workspaces for JS/TS and Gradle multi-project for Java, without Nx. Use when setting up or modifying the repo layout, workspaces, or shared packages.
---

# Monorepo — pnpm workspaces (no Nx)

Polyglot monorepo kept deliberately simple. **pnpm workspaces** for JS/TS, **Gradle
multi-project** for Java. No Nx — the goal is system design, not build tooling.

## Layout

```text
project-youtube-clone/
├── apps/
│   ├── web/                   # React 19 + Vite + Tailwind v4
│   ├── api-gateway/           # NestJS BFF/gateway
│   ├── upload-service/        # NestJS (presigned URLs, metadata write, outbox)
│   ├── metadata-service/      # NestJS (video/channel CRUD, Postgres)
│   ├── search-service/        # NestJS (Kafka consumer -> Elasticsearch)
│   ├── notification-service/  # NestJS (WebSocket, Kafka consumer)
│   └── transcoder-service/    # Spring Boot 4.1 + Java 21 (RabbitMQ + ffmpeg)
├── libs/
│   ├── ts/
│   │   ├── contracts/         # shared event/DTO types (source of truth)
│   │   ├── config/            # zod-validated typed config
│   │   ├── ports/             # StoragePort, QueuePort, SearchPort
│   │   └── ui/                # tailwind-styled-components design system
│   └── java/
│       └── common/            # shared Java (events, config, ffmpeg wrapper)
├── infra/                     # docker-compose-{local,local-observability}.yaml, k8s (kind+helm)
├── load-testing/              # k6 scripts
├── docs/                      # PRD, LEARNING-GOALS, DECISIONS, SKILLS
├── .kiro/                     # specs, steering, skills, hooks
├── pnpm-workspace.yaml
├── package.json               # root: scripts + git hooks
└── settings.gradle.kts        # Gradle multi-project (Java services)
```

## pnpm workspace

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "libs/ts/*"
```

- Shared TS types live in `libs/ts/contracts` and are imported by services via the
  workspace protocol (`"@yt/contracts": "workspace:*"`).
- Java services are a Gradle composite/multi-project included from `settings.gradle.kts`.

## Script convention

Root `package.json` uses the `start|stop:env:service` pattern:

- `env`: `l` = local, `lo` = local-observability, `k` = k8s
- `service`: `pods` = containers, `<name>` = a specific app

```bash
start:l:pods      # docker compose up (local infra)
start:l:web       # vite dev server
start:l:api       # nest start (api-gateway)
stop:l:pods
logs:l
```

## Rules

- No Nx. Reach for pnpm filters (`pnpm --filter <app> ...`) and plain scripts.
- Internal npm packages resolve via the org registry (configured in `.npmrc`).
- Each service is independently buildable and runnable; contracts are the only shared
  coupling between languages (events/REST), never shared runtime code across Node↔Java.
- One Dockerfile per app; multi-stage builds.
