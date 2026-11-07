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

| Capability                     | How                   | Status                        |
| ------------------------------ | --------------------- | ----------------------------- |
| Local infra (Postgres + MinIO) | `pnpm start:l:pods`   | ✅ available                  |
| Upload service (NestJS)        | `pnpm start:l:upload` | ✅ available                  |
| Web UI (React)                 | —                     | ⏳ not built yet              |
| Transcoder (Spring Boot)       | —                     | ⏳ not built yet              |
| Observability (otel-lgtm)      | `pnpm start:lo:pods`  | ⏳ compose file not added yet |

## 1. Install dependencies

```bash
pnpm install
```

## 2. Prepare container images

Image names and versions are listed in [IMAGES.md](IMAGES.md). If you pull from a private
registry or mirror, tag the images to their plain names once after pulling:

```powershell
$env:IMAGE_REGISTRY = "<registry-host>[:port]"
pwsh -File infra/retag-images.ps1
```

The script reports any image that has not been pulled yet; pull it and re-run.

## 3. Start local infrastructure

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

## 4. Run the upload service

Needs MinIO running (step 3). Config comes from `apps/upload-service/.env.sample`.

```bash
pnpm start:l:upload
```

Request a presigned upload URL, then PUT the file straight to storage:

```bash
curl -X POST http://localhost:3001/uploads/presign \
  -H "Content-Type: application/json" \
  -d '{"filename":"clip.mp4","contentType":"video/mp4"}'

curl -X PUT --data-binary @clip.mp4 -H "Content-Type: video/mp4" "<uploadUrl from response>"
```

## Local service URLs & credentials

| Service        | URL                     | Credentials                                             |
| -------------- | ----------------------- | ------------------------------------------------------- |
| Upload service | <http://localhost:3001> | none yet (auth comes with Keycloak)                     |
| -------------  | ----------------------- | ------------------------------------------------------- |
| Postgres       | `localhost:5432`        | user `yt` / password `yt_password` / db `youtube_clone` |
| MinIO S3 API   | <http://localhost:9000> | `minioadmin` / `minioadmin`                             |
| MinIO Console  | <http://localhost:9001> | `minioadmin` / `minioadmin`                             |

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
