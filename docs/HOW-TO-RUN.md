# How to Run

How to start, stop, and work with the project locally. This document is kept up to date as
runnable pieces are added — check the **Status** column for what actually works today.

## Prerequisites

- Docker Desktop (running)
- Node.js >= 22 and **pnpm** (`npm i -g pnpm`)
- JDK 21 (for example Temurin) for the Spring Boot transcoder; no separate Gradle install, the wrapper downloads it
- (Later phases) `kind` + `helm` for the k8s stage

## Script convention

Scripts follow `start|stop:env:service`:

- **env:** `l` = local, `lo` = local-observability
- **service:** `pods` = infra containers, `<app>` = a specific service

## What runs today

| Capability                                        | How                       | Status                                             |
| ------------------------------------------------- | ------------------------- | -------------------------------------------------- |
| Local infra (Postgres, MinIO, Keycloak, RabbitMQ) | `pnpm start:l:pods`       | ✅ available                                       |
| HLS edge cache (nginx, port 8088)                 | `pnpm start:l:pods`       | ✅ available                                       |
| Upload service (NestJS)                           | `pnpm start:l:upload`     | ✅ available                                       |
| Web UI (React)                                    | `pnpm start:l:web`        | ✅ available                                       |
| Transcoder (Spring Boot)                          | `pnpm start:l:transcoder` | ✅ transcodes to MP4 renditions (ffmpeg in Docker) |
| Observability (otel-lgtm)                         | `pnpm start:lo:pods`      | ⏳ compose file not added yet                      |

Web app settings live in `apps/web/.env.development` (public values only). Override any of them
in a git-ignored `apps/web/.env.local`. Restart `pnpm start:l:web` after changing either file.

| Variable              | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `VITE_API_BASE_URL`   | API prefix used by the browser (`/api`)  |
| `VITE_OIDC_AUTHORITY` | Keycloak realm URL                       |
| `VITE_OIDC_CLIENT_ID` | Keycloak client (`yt-web`)               |
| `API_PROXY_TARGET`    | Where the Vite dev proxy forwards `/api` |

## Run the tests

```bash
pnpm test             # every workspace, once
pnpm test:coverage    # also enforces the coverage gates
pnpm --filter @yt/web test      # one workspace
```

Tests use in-memory fakes, so they need no Docker, database or network. `pnpm test` also runs the transcoder's Java tests through Gradle; `pnpm test:coverage` adds its 75% JaCoCo gate.

## API docs and contracts

With the upload service running, Swagger UI is at <http://localhost:3001/docs> and the raw spec at
<http://localhost:3001/docs-json>. The spec is also committed as `contracts/upload-service.openapi.json`,
and the web app's types (`apps/web/src/api/schema.d.ts`) are generated from that file.

The RabbitMQ message is a contract too: `contracts/transcode-command.schema.json` is generated from the Zod
schema in `apps/upload-service/src/messaging/transcode-command.ts` by the same `pnpm api:generate`. A
transcoder test reads it and fails if the Java record `TranscodeCommandMessage` drifts from it.

It stays current automatically:

- Starting the upload service (any non-`aws` env) rewrites the spec if the API changed.
- `pnpm start:l:web` regenerates the web types from the spec before starting Vite.
- A pre-commit hook runs `pnpm api:generate` when upload-service code is staged and adds the results.

To do it by hand, or to check for drift (for CI):

```bash
pnpm api:generate
pnpm api:check
```

The type generator runs through `pnpm dlx` and downloads on first use.

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

The script reports any image that has not been pulled yet; pull it and re-run. If your registry keeps an
image under a different path, map it in the git-ignored `infra/retag-images.local.json`, for example
`{ "team/images/nginx:1.26.3-build7": "nginx:1.26.3" }`; entries there override the defaults.

## 3. Start local infrastructure

Brings up Postgres, MinIO, Keycloak and RabbitMQ, and auto-creates the `raw-videos` and `hls-videos` buckets.
`raw-videos` is private (uploads and the original go through presigned URLs). `hls-videos` allows anonymous
`GetObject` but not listing (`infra/minio/hls-read-policy.json`), because a player fetches every segment a
playlist names and those URLs cannot each be signed. After pulling changes to that policy, apply it with
`docker compose -f infra/docker-compose-local.yaml up -d --force-recreate minio-setup`.

Players do not talk to MinIO directly: the **edge** (`yt-edge`, nginx 1.26.3, <http://localhost:8088>) sits
in front of `hls-videos` and caches what it serves (`infra/edge/`). The upload service hands out edge URLs
(`HLS_PUBLIC_BASE_URL`, default `http://localhost:8088/hls-videos`).

| Path at the edge                                     | Edge cache | Browser `Cache-Control`               |
| ---------------------------------------------------- | ---------- | ------------------------------------- |
| `/hls-videos/<id>/hls/<rendition>/seg_NNN.ts`        | 30 days    | `public, max-age=31536000, immutable` |
| `/hls-videos/<id>/hls/master.m3u8`, `.../index.m3u8` | 60 s       | `public, max-age=60`                  |
| anything else (listing, `manifest.json`, raw)        | -          | 404                                   |

- `X-Cache-Status` shows `MISS`, `HIT`, `STALE` or `UPDATING`; the access log (`docker logs yt-edge`) has it too.
- Byte ranges (`Range: bytes=...`) are answered with 206 from the cached copy; on a miss nginx fetches the
  whole segment once.
- Many viewers asking for the same cold segment cause one MinIO request (cache lock).
- While MinIO is down, cached segments and playlists keep playing (`proxy_cache_use_stale`).
- Only `GET`, `HEAD` and CORS preflight are allowed; CORS is `*` because the content is public.
- Empty the cache: `docker compose -f infra/docker-compose-local.yaml rm -sfv edge` then `up -d edge`
  (or `pnpm stop:l:pods`, which drops all volumes). Requests to try are in `http/edge.http`.

Keycloak takes about 30 seconds to start. It imports `infra/keycloak/realm-youtube-clone.json`:

| Item           | Value                                        |
| -------------- | -------------------------------------------- |
| Admin console  | <http://localhost:8180> (`admin` / `admin`)  |
| Realm          | `youtube-clone`                              |
| Issuer         | `http://localhost:8180/realms/youtube-clone` |
| Web client     | `yt-web` (public, PKCE)                      |
| Demo users     | `alice` / `alice`, `bob` / `bob`             |
| Token audience | `yt-api`                                     |

The import only runs when the realm does not exist yet. Change the JSON, then run `pnpm stop:l:pods` and start again.

RabbitMQ carries the transcode commands:

| Item          | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Management UI | <http://localhost:15672> (`yt` / `yt_password`)                                       |
| AMQP URL      | `amqp://yt:yt_password@localhost:5672` (`RABBITMQ_URL`)                               |
| Storage       | Named volume `rabbitmq-data`; queues survive a container restart                      |
| Exchange      | `yt.transcode` (direct), routing key `transcode.cmd`                                  |
| Work queue    | `transcoder.transcode-video` (quorum); failed messages go to `yt.transcode.dlx`       |
| Dead letters  | `transcoder.transcode-video.dlq` (quorum); inspect with `http/rabbitmq.http`          |
| Retry queue   | `transcoder.transcode-video.retry` (quorum, TTL; transcoder only), back to work queue |

Both services declare this topology on connect, so either can start first. The queue arguments must be
identical on both sides, or RabbitMQ closes the channel with `PRECONDITION_FAILED`.

Status flows back the other way: the transcoder publishes `PROCESSING`, `READY` (with the renditions) and
`FAILED` (with a reason) to the `yt.video-status` exchange, routing key `video.status`. The upload service
consumes them from `upload-service.video-status` (quorum; malformed events go to
`upload-service.video-status.dlq`) and only moves a video forward, so late or duplicate events are ignored.
The message schema is `contracts/video-status.schema.json`.

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

Needs Postgres running (step 3). Run these from the repo root:

| Script             | What it does                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `pnpm db:generate` | Generate the Prisma client (git-ignored) for every service with a database                       |
| `pnpm db:migrate`  | Dev: create a migration from schema changes and apply it; applies existing ones on a fresh clone |
| `pnpm db:reset`    | **Destructive.** Drop all data and re-apply every migration                                      |

On a fresh clone run `pnpm db:generate` and then `pnpm db:migrate`. After editing
`apps/upload-service/prisma/schema.prisma`, run `pnpm db:migrate --name <what-changed>` and commit the
new folder under `prisma/migrations/`.

The generated client lives in `apps/upload-service/src/generated/` and is not committed, so run
`db:generate` before type-checking or starting the service.

`db:reset` first runs `scripts/assert-local-db.mjs`, which refuses to continue unless the database host
in `DATABASE_URL` is `localhost` or `127.0.0.1`. `db:migrate` is for local development only; a shared
or production database gets `prisma migrate deploy`, which applies existing migrations and never
creates or resets anything.

## 5. Run the upload service

Needs MinIO running (step 3). Config comes from `apps/upload-service/.env.sample`. Upload endpoints need a Keycloak bearer token (`OIDC_ISSUER_URL`, `OIDC_AUDIENCE`); the web app signs in through Keycloak (code flow with PKCE) before uploading. Files over 16 MiB upload in parts (`UPLOAD_PART_SIZE_MB`, default 8, minimum 5): the page sends 3 parts in parallel, retries failed parts, and resumes if you choose the same file and press Upload again; Cancel discards the upload. Every 10 minutes a job deletes uploads still pending after `UPLOAD_PENDING_TTL_MINUTES` (default 1440) and aborts their multipart uploads.

```bash
pnpm start:l:upload
```

Request a presigned upload URL, then PUT the file straight to storage. `title` and
`description` are optional; the title defaults to the filename. Each presign saves a `videos`
row with status `PENDING`. `POST /uploads/:videoId/complete` marks the video `UPLOADED` and writes a
transcode command to the `outbox` table in the same transaction, then answers 201 at once. A relay inside
the upload service publishes due outbox rows to RabbitMQ every `OUTBOX_POLL_INTERVAL_MS` (default 1000).
If RabbitMQ is down, the rows wait and are retried with backoff (1 s doubling, at most 5 min); nothing is
lost and the client sees no error. Sent rows are deleted after `OUTBOX_RETENTION_HOURS` (default 72).
Inspect the backlog with `select type, attempts, last_error, sent_at from outbox order by created_at desc;`.

After that the video moves `UPLOADED → PROCESSING → READY` (or `FAILED`). `GET /videos/:id` then returns
`renditions` (signed URLs, highest first) and `playbackUrl` points at the highest one; a failed video keeps
the original as `playbackUrl` and explains itself in `failureReason`. The upload page and the watch page
poll this every 2 seconds until the video is `READY` or `FAILED`, then stop.

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

Open <http://localhost:5173>. The app has three pages: **Videos** (infinite-scroll list), **Upload** (pick a
file, with progress), and **Watch** (plays the video). The dev server proxies `/api` to the
upload service on port 3001, so the browser needs no CORS setup for the API. Uploads go
straight from the browser to MinIO, which allows cross-origin requests by default.

## 7. Run the transcoder service

Needs JDK 21 on `PATH`. The first run downloads Gradle 9.8.2 and the dependencies, which can take a few
minutes.

```bash
pnpm start:l:transcoder
```

It listens on port 3002 and consumes `transcoder.transcode-video`. For each command it downloads the raw
file from MinIO, probes its size with ffprobe, and encodes an HLS ladder up to the source height (360p,
480p, 720p and 1080p, never upscaling): H.264/AAC in 4-second MPEG-TS segments with a keyframe every
2 seconds in every rendition, so players can switch quality at any segment edge. Output goes to
`hls-videos/<videoId>/hls/<rendition>/index.m3u8` + `seg_NNN.ts`, then `hls-videos/<videoId>/hls/master.m3u8`
(bandwidth and resolution per variant), and the work directory is deleted.
Last it writes `hls-videos/<videoId>/manifest.json`; a duplicate command for a video with a manifest is
skipped. Failures are sorted:

- Permanent (invalid command, file is not a video, source object missing): straight to the DLQ.
- Transient (MinIO or the broker down, ffmpeg timed out or killed): parked in
  `transcoder.transcode-video.retry` for `TRANSCODE_RETRY_DELAY`, then delivered again, up to
  `TRANSCODE_MAX_ATTEMPTS` in total; after that, the DLQ.

`/actuator/health` includes the RabbitMQ connection. Run its checks
without starting it: `pnpm --filter @yt/transcoder-service build` (compile, tests, coverage gate).

### ffmpeg

No local install is needed. In the `local` profile every ffprobe and ffmpeg call runs as
`docker run --rm mwader/static-ffmpeg:latest` with the work directory mounted at `/work`, so Docker Desktop
must be running. Get the image once, then tag it with its plain name:

```powershell
docker pull <registry>/mwader/static-ffmpeg:latest
pwsh -File infra/retag-images.ps1 -Registry <registry>
```

Leave `FFMPEG_DOCKER_IMAGE` empty to call installed binaries instead (`FFMPEG_PATH`, `FFPROBE_PATH`); the
`aws` profile does that, and its image will copy `/ffmpeg` and `/ffprobe` from the same image. The
ffmpeg and storage integration tests run only when the image and MinIO are available; otherwise they are
skipped.

### From IntelliJ

Open `apps/transcoder-service` as the IntelliJ project. The run list then shows
**TranscoderServiceApplication (sample)**, loaded from the committed
`.run/TranscoderServiceApplication.sample.run.xml` (profile `local` plus the env vars below).

For your own settings, copy it to the git-ignored `.run/TranscoderServiceApplication.run.xml` and rename the
configuration inside to `TranscoderServiceApplication`. Add any new variable to the sample as well.

| Variable                                               | Local value                          | Read by                                     |
| ------------------------------------------------------ | ------------------------------------ | ------------------------------------------- |
| `SPRING_PROFILES_ACTIVE`                               | `local` (the default)                | Spring Boot; the run config sets it too     |
| `SERVER_PORT`                                          | `3002`                               | `application.yaml`                          |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`                   | `http://localhost:9000`, `us-east-1` | `AppProperties` (`app.storage.*`)           |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`             | `minioadmin` / `minioadmin`          | `AppProperties`; required outside `local`   |
| `STORAGE_RAW_BUCKET`, `STORAGE_HLS_BUCKET`             | `raw-videos`, `hls-videos`           | `AppProperties`                             |
| `STORAGE_FORCE_PATH_STYLE` (optional)                  | `true` in `local`, `false` otherwise | `AppProperties`                             |
| `TRANSCODE_WORK_DIR` (optional)                        | `<temp>/yt-transcoder`               | `AppProperties` (`app.transcode.work-dir`)  |
| `FFMPEG_DOCKER_IMAGE`                                  | `mwader/static-ffmpeg:latest`        | `AppProperties`; empty = installed binaries |
| `FFMPEG_PATH`, `FFPROBE_PATH` (optional)               | `ffmpeg`, `ffprobe`                  | `AppProperties`; used when no image is set  |
| `TRANSCODE_TIMEOUT` (optional)                         | `30m`                                | `AppProperties`; per ffmpeg call            |
| `TRANSCODE_MAX_ATTEMPTS` (optional)                    | `3`                                  | `AppProperties`; includes the first try     |
| `TRANSCODE_RETRY_DELAY` (optional)                     | `10s`                                | `AppProperties`; retry queue TTL            |
| `SPRING_RABBITMQ_HOST`, `SPRING_RABBITMQ_PORT`         | `localhost`, `5672`                  | Spring AMQP (Boot defaults)                 |
| `SPRING_RABBITMQ_USERNAME`, `SPRING_RABBITMQ_PASSWORD` | `yt` / `yt_password`                 | Spring AMQP; `application-local.yaml`       |

Profiles live in `src/main/resources/application-<profile>.yaml`. `local` supplies the MinIO defaults,
`local-observability` adds metrics and also activates `local`, and `aws` takes every storage value from the
environment and refuses to start when one is missing.

To edit them in the dialog: **Modify options > Environment variables** shows the field; the icon at its right
opens a table. The field only appears by default once the config has a value.

## Local service URLs & credentials

| Service        | URL                                     | Credentials                                             |
| -------------- | --------------------------------------- | ------------------------------------------------------- |
| Upload service | <http://localhost:3001>                 | Keycloak bearer token (see `http/keycloak.http`)        |
| Transcoder     | <http://localhost:3002/actuator/health> | none                                                    |
| Postgres       | `localhost:5432`                        | user `yt` / password `yt_password` / db `youtube_clone` |
| MinIO S3 API   | <http://localhost:9000>                 | `minioadmin` / `minioadmin`                             |
| MinIO Console  | <http://localhost:9001>                 | `minioadmin` / `minioadmin`                             |
| HLS edge       | <http://localhost:8088/healthz>         | none (public, read-only)                                |

> Credentials are local dev defaults only — never use them outside local.

## Markdown docs

```bash
pnpm lint:md     # check
pnpm format:md   # auto-fix
```

## Java formatting

Spotless with google-java-format. Every Gradle compile formats the sources first, and the pre-commit hook
formats and tests the transcoder when its Java files are staged.

```bash
pnpm format:java         # apply
pnpm format:java:check   # check only, fails if anything is unformatted
```

In IntelliJ, install the google-java-format plugin and enable it, so the editor matches what Spotless writes.

## Troubleshooting

| Issue                                                                                          | Fix                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `port is already allocated`                                                                    | Another service uses 5432/9000/9001. Stop it or change the host port in `infra/docker-compose-local.yaml`.                                                                                                                                                                                                               |
| MinIO buckets missing                                                                          | Check the `yt-minio-setup` container logs: `pnpm logs:l`. It runs once then exits — that is expected.                                                                                                                                                                                                                    |
| `docker compose` not found                                                                     | Docker Desktop not running, or old Docker without Compose v2.                                                                                                                                                                                                                                                            |
| Postgres exits with "in 18+, these Docker images are configured..."                            | Volume must mount at `/var/lib/postgresql` (not `/data`). Already fixed in compose; if it persists, run `pnpm stop:l:pods` to drop the old volume.                                                                                                                                                                       |
| DBeaver or a Java app fails with `invalid value for parameter "TimeZone": "Asia/Calcutta"`     | Postgres 18 dropped legacy zone names. Start the Java client with `-Duser.timezone=Asia/Kolkata` (DBeaver: add it under `-vmargs` in `dbeaver.ini`, then restart). Keep the server on UTC.                                                                                                                               |
| Web page is blank and `/src/main.tsx` returns 500                                              | A dependency was installed while Vite was running. Stop `pnpm start:l:web` and start it again.                                                                                                                                                                                                                           |
| Gradle: `Cannot invoke "org.gradle.cache.FileLock.writeFile..." ... is null` (CLI or IntelliJ) | Gradle daemons started on different JDKs are fighting over the cache. Run `apps/transcoder-service/gradlew --stop`, make sure `JAVA_HOME` points to JDK 21 (open a new terminal after changing it), and in IntelliJ set **Settings > Build Tools > Gradle > Gradle JVM** to that JDK 21, then reload the Gradle project. |
| Gradle says it cannot find a Java 21 toolchain                                                 | Install a JDK 21 (not a JRE); Gradle detects installed JDKs, or point `JAVA_HOME` at one. `gradle/gradle-daemon-jvm.properties` makes the Gradle daemon itself run on that JDK 21, so a `JAVA_HOME` that points to an older JRE still works.                                                                             |
| `You are running Spotless on JVM 17, which limits you to google-java-format 1.28.0`            | The Gradle daemon is not on Java 21. Check that `apps/transcoder-service/gradle/gradle-daemon-jvm.properties` exists, run `gradlew --stop`, and in IntelliJ set **Gradle JVM** to JDK 21 (or "Daemon JVM criteria").                                                                                                     |
| Videos stay `UPLOADED` and nothing reaches the transcoder                                      | Check the `outbox` table: unsent rows with `last_error` mean the relay cannot reach RabbitMQ (`docker ps` for `yt-rabbitmq`, `RABBITMQ_URL`). They are delivered automatically once it is back. No rows at all means the upload service runs older code; restart it.                                                     |
| RabbitMQ log or app log shows `PRECONDITION_FAILED - inequivalent arg`                         | The queue exists with other arguments than the code declares. Keep `transcode-topology.ts` and `MessagingConfig.java` identical; locally, delete the queue in the management UI (or `pnpm stop:l:pods`) to recreate it.                                                                                                  |
