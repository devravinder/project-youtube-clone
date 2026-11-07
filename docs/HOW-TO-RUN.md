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
| Web UI (React)                 | `pnpm start:l:web`    | ✅ available                  |
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

## 4. Set up the database

Needs Postgres running (step 3). Run once after cloning, and again after schema changes:

```bash
pnpm --filter @yt/upload-service db:generate   # generate the Prisma client (git-ignored)
pnpm --filter @yt/upload-service db:migrate    # create and apply a migration (dev)
pnpm --filter @yt/upload-service db:deploy     # apply existing migrations only
```

The generated client lives in `apps/upload-service/src/generated/` and is not committed, so
run `db:generate` on a fresh clone before type-checking or starting the service.

## 5. Run the upload service

Needs MinIO running (step 3). Config comes from `apps/upload-service/.env.sample`.

```bash
pnpm start:l:upload
```

Request a presigned upload URL, then PUT the file straight to storage. `title` and
`description` are optional; the title defaults to the filename. Each presign saves a `videos`
row with status `UPLOADED`:

```bash
curl -X POST http://localhost:3001/uploads/presign \
  -H "Content-Type: application/json" \
  -d '{"filename":"clip.mp4","contentType":"video/mp4","title":"My clip"}'

curl -X PUT --data-binary @clip.mp4 -H "Content-Type: video/mp4" "<uploadUrl from response>"
```

### Test with httpYac

Requests for all services live in the root `http/` folder, one `.http` file per service.
Install the VS Code extension `anweber.vscode-httpyac`, open `http/upload-service.http`, and
click **Send** above any request.

Set the file used for the upload request once:

```powershell
Copy-Item http/.env.sample http/.env
```

Edit `VIDEO_FILE` in `http/.env` (git-ignored) to point at any local video. A relative path
resolves from the `http/` folder, so use `../tmp/sample.mp4` or an absolute path. A wrong path
uploads 0 bytes yet still returns 200, so check the object size in the MinIO console.

Full recordings can be 0.7 to 2 GB. For quick checks, cut a small slice into the ignored
`tmp/` folder:

```powershell
$buf = New-Object byte[] (5MB)
$fs = [IO.File]::OpenRead("<path to a recording>"); [void]$fs.Read($buf, 0, $buf.Length); $fs.Dispose()
[IO.File]::WriteAllBytes("tmp/sample.mp4", $buf)
```

The slice is not playable but is enough to test uploads. Run all requests from the terminal:

```bash
pnpm dlx httpyac send http/upload-service.http --all
```

## 6. Run the web app

Needs the upload service running (step 5) and MinIO and Postgres up (step 3).

```bash
pnpm start:l:web
```

Open <http://localhost:5173>. The app has three pages: **Videos** (list), **Upload** (pick a
file, with progress), and **Watch** (plays the video). The dev server proxies `/api` to the
upload service on port 3001, so the browser needs no CORS setup for the API. Uploads go
straight from the browser to MinIO, which allows cross-origin requests by default.

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

| Issue                                                                                      | Fix                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `port is already allocated`                                                                | Another service uses 5432/9000/9001. Stop it or change the host port in `infra/docker-compose-local.yaml`.                                                                                 |
| MinIO buckets missing                                                                      | Check the `yt-minio-setup` container logs: `pnpm logs:l`. It runs once then exits — that is expected.                                                                                      |
| `docker compose` not found                                                                 | Docker Desktop not running, or old Docker without Compose v2.                                                                                                                              |
| Postgres exits with "in 18+, these Docker images are configured..."                        | Volume must mount at `/var/lib/postgresql` (not `/data`). Already fixed in compose; if it persists, run `pnpm stop:l:pods` to drop the old volume.                                         |
| DBeaver or a Java app fails with `invalid value for parameter "TimeZone": "Asia/Calcutta"` | Postgres 18 dropped legacy zone names. Start the Java client with `-Duser.timezone=Asia/Kolkata` (DBeaver: add it under `-vmargs` in `dbeaver.ini`, then restart). Keep the server on UTC. |
