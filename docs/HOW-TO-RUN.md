# How to Run

How to start, stop, and work with the project locally. This document is kept up to date as
runnable pieces are added — check the **Status** column for what actually works today.

## Prerequisites

- Docker Desktop (running)
- Node.js >= 22 and **pnpm** (`npm i -g pnpm`)
- (Later phases) JDK 21 for the Spring Boot transcoder; `kind` + `helm` for the k8s stage

## Script convention

Scripts follow `start|stop:env:service`:

- **env:** `l` = local, `lo` = local-observability
- **service:** `pods` = infra containers, `<app>` = a specific service

## What runs today

| Capability                     | How                  | Status                        |
| ------------------------------ | -------------------- | ----------------------------- |
| Local infra (Postgres + MinIO) | `pnpm start:l:pods`  | ✅ available                  |
| Upload service (NestJS)        | —                    | ⏳ not built yet              |
| Web UI (React)                 | —                    | ⏳ not built yet              |
| Transcoder (Spring Boot)       | —                    | ⏳ not built yet              |
| Observability (otel-lgtm)      | `pnpm start:lo:pods` | ⏳ compose file not added yet |

## 1. Install dependencies

```bash
pnpm install
```

## 2. Start local infrastructure

Brings up Postgres and MinIO, and auto-creates the `raw-videos` and `hls-videos` buckets.

```bash
pnpm start:l:pods
```

Stop (and remove volumes):

```bash
pnpm stop:l:pods
```

Tail logs:

```bash
pnpm logs:l
```

## Local service URLs & credentials

| Service       | URL                     | Credentials                                             |
| ------------- | ----------------------- | ------------------------------------------------------- |
| Postgres      | `localhost:5432`        | user `yt` / password `yt_password` / db `youtube_clone` |
| MinIO S3 API  | <http://localhost:9000> | `minioadmin` / `minioadmin`                             |
| MinIO Console | <http://localhost:9001> | `minioadmin` / `minioadmin`                             |

> Credentials are local dev defaults only — never use them outside local.

## Markdown docs

```bash
pnpm lint:md     # check
pnpm format:md   # auto-fix
```

## Troubleshooting

| Issue                       | Fix                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `port is already allocated` | Another service uses 5432/9000/9001. Stop it or change the host port in `infra/docker-compose-local.yaml`. |
| MinIO buckets missing       | Check the `yt-minio-setup` container logs: `pnpm logs:l`. It runs once then exits — that is expected.      |
| `docker compose` not found  | Docker Desktop not running, or old Docker without Compose v2.                                              |
