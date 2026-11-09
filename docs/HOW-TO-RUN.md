# How to Run

How to start, stop, and work with the project locally. This document is kept up to date as
runnable pieces are added — check the **Status** column for what actually works today.

## Prerequisites

- Docker: Docker Desktop on Windows/macOS, Docker Engine (or Docker Desktop) on Linux
- Node.js >= 22 and **pnpm** (`npm i -g pnpm`)
- JDK 21 (for example Temurin) for the Spring Boot transcoder; no separate Gradle install, the wrapper downloads it
- (Later phases) `kind` + `helm` for the k8s stage

Every command in this guide works on Windows (PowerShell) and Linux/macOS (bash); where they differ both
are shown.

### Linux (Ubuntu) notes

- Docker Engine: install `docker-ce` and the compose plugin from Docker's apt repository, then
  `sudo usermod -aG docker $USER` and log in again, so `docker` (and the transcoder's ffmpeg containers)
  run without sudo.
- Node: use `nvm` (or NodeSource) for Node 22+; Ubuntu's own `nodejs` package is usually older.
- JDK 21: `sudo apt install openjdk-21-jdk` (or Temurin). Gradle runs through `./gradlew`, which is
  committed with its executable bit.
- Elasticsearch runs as a single node, which skips the production bootstrap checks, so it starts with
  Ubuntu's default `vm.max_map_count`. If it logs a `max virtual memory areas` warning, raise it with
  `sudo sysctl -w vm.max_map_count=262144`.
- Docker Desktop for Linux only shares your home directory with containers. If the transcoder logs
  "No such file" for `/work/...`, set `TRANSCODE_WORK_DIR=$HOME/.cache/yt-transcoder` (the default is
  under `/tmp`). Docker Engine has no such limit.
- Scripts: `infra/retag-images.sh` replaces `infra/retag-images.ps1`; everything else is a `pnpm` script.

## Script convention

Scripts follow `start|stop:env:service`:

- **env:** `l` = local, `lo` = local-observability
- **service:** `pods` = infra containers, `<app>` = a specific service

## What runs today

| Capability                                        | How                                 | Status                                              |
| ------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| Local infra (Postgres, MinIO, Keycloak, RabbitMQ) | `pnpm start:l:pods`                 | ✅ available                                        |
| Kafka (KRaft) + Elasticsearch                     | `pnpm start:l:pods`                 | ✅ available                                        |
| HLS edge cache (nginx, port 8088)                 | `pnpm start:l:pods`                 | ✅ available                                        |
| Upload service (NestJS)                           | `pnpm start:l:upload`               | ✅ available                                        |
| Web UI (React)                                    | `pnpm start:l:web`                  | ✅ available                                        |
| Transcoder (Spring Boot)                          | `pnpm start:l:transcoder`           | ✅ transcodes to MP4 renditions (ffmpeg in Docker)  |
| Search service (NestJS, Kafka → Elasticsearch)    | `pnpm start:l:search`               | ✅ indexes `video.ready`, search + autocomplete API |
| Notification service (NestJS, Kafka → WebSocket)  | `pnpm start:l:notify`               | ✅ live toasts in the web app                       |
| Observability (otel-lgtm)                         | `pnpm start:lo:pods` + `start:lo:*` | ✅ see [Quick start](#with-observability)           |

Web app settings live in `apps/web/.env.development` (public values only). Override any of them
in a git-ignored `apps/web/.env.local`. Restart `pnpm start:l:web` after changing either file.

| Variable                     | Purpose                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`          | API prefix used by the browser (`/api`)                                         |
| `VITE_OIDC_AUTHORITY`        | Keycloak realm URL                                                              |
| `VITE_OIDC_CLIENT_ID`        | Keycloak client (`yt-web`)                                                      |
| `VITE_NOTIFICATIONS_PATH`    | WebSocket path on the page's own host (`/ws`)                                   |
| `VITE_SEARCH_BASE_URL`       | Search API prefix used by the browser (`/search-api`)                           |
| `API_PROXY_TARGET`           | Where the Vite dev proxy forwards `/api`                                        |
| `NOTIFICATIONS_PROXY_TARGET` | Where the Vite dev proxy forwards the `/ws` WebSocket (`http://localhost:3004`) |
| `SEARCH_PROXY_TARGET`        | Where the Vite dev proxy forwards `/search-api` (`http://localhost:3003`)       |

## Quick start

There are two ways to run everything. Pick one and use **only** its commands, containers and services
alike. Both use the same containers and data, so you can switch modes without losing anything (see
[Switching and mixing](#switching-and-mixing)).

### Without observability (default)

```bash
pnpm install
pnpm start:l:pods        # infrastructure containers
pnpm db:generate         # first time, or after a schema change
pnpm db:migrate          # first time, and after every stop:l:pods (it deletes the database)
```

Then one terminal per service:

```bash
pnpm start:l:upload
pnpm start:l:transcoder
pnpm start:l:search
pnpm start:l:notify
pnpm start:l:web         # http://localhost:5173
```

Stop the services with Ctrl+C. Then stop the containers:

| Command                                                  | Keeps your data?                                                |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `docker compose -f infra/docker-compose-local.yaml stop` | yes                                                             |
| `pnpm stop:l:pods`                                       | **no**, deletes every volume (database, uploads, topics, index) |

### With observability

```bash
pnpm install
pnpm start:lo:pods       # the same containers, plus yt-lgtm (Grafana, Tempo, Loki, Prometheus)
pnpm db:generate         # first time, or after a schema change
pnpm db:migrate          # first time, and after every stop:lo:pods (it deletes the database)
```

Then one terminal per service. The services use the `lo` scripts, all except the web app:

```bash
pnpm start:lo:upload
pnpm start:lo:transcoder
pnpm start:lo:search
pnpm start:lo:notify
pnpm start:l:web         # http://localhost:5173 (the browser is not instrumented)
```

Open Grafana at <http://localhost:3000> (`admin` / `admin`) → Dashboards → Mini YouTube. See
[Observability](#observability) for what is collected and how to follow one upload.

Stop the services with Ctrl+C. Then stop the containers:

| Command                                                                | Keeps your data?             |
| ---------------------------------------------------------------------- | ---------------------------- |
| `docker compose -f infra/docker-compose-local-observability.yaml stop` | yes                          |
| `pnpm stop:lo:pods`                                                    | **no**, deletes every volume |

### All in containers

Every service runs from its image instead of a dev server. This is how they will run in Kubernetes,
and it is a good check before deploying.

```bash
pnpm images:build        # once, and after code changes (slow the first time: installs dependencies)
pnpm start:c:all         # infrastructure + db-migrate + the five services
```

Open <http://localhost:8090>. The web container's nginx serves the app and proxies `/api`, `/search-api`
and `/ws`, as the Vite dev server does. Don't run the dev servers at the same time: both sets would
consume the same queues and topics.

| Command                                                       | Keeps your data?             |
| ------------------------------------------------------------- | ---------------------------- |
| `docker compose -f infra/docker-compose-local-apps.yaml stop` | yes                          |
| `pnpm stop:c:all`                                             | **no**, deletes every volume |

How the containers find each other:

- Containers use the compose names (`postgres`, `kafka`, `minio`, …).
- Browsers still use `localhost`. That's why the upload service signs storage URLs for
  `STORAGE_PUBLIC_ENDPOINT=http://localhost:9000`, and fetches Keycloak's keys from `OIDC_JWKS_URL`
  (`keycloak:8180`) while tokens keep the public issuer `localhost:8180`.
- `TRUST_PROXY_HOPS=1` makes the upload service read the viewer's IP from nginx's `X-Forwarded-For`.

The images are built by `scripts/build-images.mjs` from `infra/docker/`. Your `~/.npmrc` (registry login)
and the CA file it names are passed as BuildKit secrets. They are used during the install and are not
kept in any image layer.

### Switching and mixing

Both compose files share the project name `youtube-clone-local`, so `start:lo:pods` reuses the same
Postgres, MinIO, Kafka and other containers, and only adds `yt-lgtm`. Switching modes keeps your data and
needs no new migration.

| Containers started with | Services started with | Result                                                                   |
| ----------------------- | --------------------- | ------------------------------------------------------------------------ |
| `start:l:pods`          | `start:l:*`           | Normal local run, no telemetry                                           |
| `start:lo:pods`         | `start:lo:*`          | Normal local run, plus traces, metrics and logs in Grafana               |
| `start:lo:pods`         | `start:l:*`           | The app works, but Grafana stays empty: the services send nothing        |
| `start:l:pods`          | `start:lo:*`          | The app works, but nothing listens on port 4318, so telemetry is dropped |

To turn telemetry on after starting with `start:lo:pods` and `start:l:*`, restart each service with its
`start:lo:*` script. The containers can stay as they are.

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

Kafka events have one too: `contracts/video-events.schema.json`, generated from the Zod schema in
`libs/ts/contracts` (`@yt/contracts`), which the producer (upload service) and every consumer import.

`contracts/asyncapi.json` (AsyncAPI 3.1) describes the whole event surface in one place: the Kafka
topics `yt.video-events` and `yt.video-events.dlt`, the `/ws` notification socket, who sends and who
receives each message (with consumer groups), headers, keys and payloads. It is generated from the same
Zod schemas by `pnpm api:generate`, and `pnpm --filter @yt/contracts test` fails if the committed file is
stale or the official `@asyncapi/parser` reports an error. Paste it into <https://studio.asyncapi.com> to
browse it (that sends the file to the site; it holds no secrets).

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

```bash
# Linux / macOS (same image list, same infra/retag-images.local.json)
IMAGE_REGISTRY="<registry-host>[:port]" ./infra/retag-images.sh
```

The script reports any image that has not been pulled yet; pull it and re-run. If your registry keeps an
image under a different path, map it in the git-ignored `infra/retag-images.local.json`, for example
`{ "team/images/nginx:1.26.3-build7": "nginx:1.26.3" }`; entries there override the defaults.

## 3. Start local infrastructure

Brings up Postgres, MinIO, Keycloak, RabbitMQ, Kafka and Elasticsearch, and auto-creates the `raw-videos` and
`hls-videos` buckets and the Kafka topics.
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

Kafka carries **events** (facts other services react to), next to RabbitMQ's **commands** (ADR-002):

| Item         | Value                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------- |
| Container    | `yt-kafka` (Bitnami Kafka 3.5.1, KRaft: one node is both broker and controller)          |
| Bootstrap    | `localhost:9094` from the host (`KAFKA_BROKERS`), `kafka:9092` from other containers     |
| Events topic | `yt.video-events`: 3 partitions, key = videoId, compacted (latest event per video kept)  |
| Dead letters | `yt.video-events.dlt`: events a consumer could not handle, kept 14 days                  |
| Topic setup  | One-shot `kafka-setup` container; auto-create is off, so a typo in a client fails loudly |

Kafka has no web UI here (none in the image list), so use the CLIs in the container:

```bash
docker exec yt-kafka kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic yt.video-events
# Read everything from the start (Ctrl+C to stop); shows the key and the headers
docker exec -it yt-kafka kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic yt.video-events --from-beginning --property print.key=true --property print.headers=true
# Consumer groups: where each one is (CURRENT-OFFSET) and how far behind (LAG)
docker exec yt-kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups
```

Elasticsearch (`yt-elasticsearch`, 8.19.16, <http://localhost:9200>) is the search index. It runs as a
single node with security off and a 512 MB heap (about 1.2 GB of RAM in total). Requests to try are in
`http/elasticsearch.http`.

Redis (`yt-redis`, 6.2.24, `localhost:6379`) caches video rows and buffers view counts. It runs with AOF on,
a 128 MB limit and `maxmemory-policy volatile-lru`, so under memory pressure only keys with a TTL (cache
entries) are evicted, never the view counters. Look inside with
`docker exec -it yt-redis redis-cli --scan --pattern 'video:*'` or `... get views:pending:<videoId>`.

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

When the transcoder reports `READY`, the same transaction that marks the video `READY` writes a
`video.ready` event to the outbox; the relay sends it to Kafka (`KAFKA_BROKERS`, default `localhost:9094`;
topic `KAFKA_VIDEO_EVENTS_TOPIC`, default `yt.video-events`). A publish that gets no broker answer within
10 s counts as a failed attempt, so a hung Kafka cannot hold up the transcode commands. Delivery is at
least once: after a Kafka outage the same event (same `eventId`) can appear more than once.
Inspect the backlog with `select type, attempts, last_error, sent_at from outbox order by created_at desc;`.

`GET /videos/:id` reads through Redis (`REDIS_URL`, default `redis://localhost:6379`): the row is cached
for `VIDEO_CACHE_TTL_SECONDS` (60) and evicted on every change. `POST /videos/:id/views` (public, 202)
counts one view per viewer per `VIEW_DEDUPE_MINUTES` (30) in Redis; every `VIEW_FLUSH_INTERVAL_MS`
(10000) the counts are added to `videos.view_count`. The detail shows Postgres plus pending, the list
shows Postgres only, so it lags by up to one flush. If Redis is down or hangs, each call gives up after
500 ms, Redis is skipped for 5 s, reads go to Postgres and views are written there directly.

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

```bash
cp http/.env.sample http/.env   # Linux / macOS
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

```bash
head -c 5M "<path to a recording>" > tmp/sample.mp4   # Linux / macOS
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

Open <http://localhost:5173>. The app has four pages: **Videos** (infinite-scroll list), **Upload** (pick a
file, with progress), **Watch** (plays the video) and **Search** (`/search?q=…`). The search box in the
header suggests titles while you type (arrow keys, Enter, Escape) and opens the results page on Enter;
it needs the search service (step 8). The dev server proxies `/api` to the
upload service on port 3001, `/search-api` to the search service on 3003 and `/ws` to the notification
service on 3004, so the browser needs no CORS setup. Uploads go
straight from the browser to MinIO, which allows cross-origin requests by default.

### Check adaptive playback by hand

1. Upload a clip of a minute or more; ABR has nothing to adapt on a clip shorter than the 30 s buffer.
2. On the Watch page, open DevTools > Network, filter on `seg_`, and add the `X-Cache-Status` column.
3. Let it play on "No throttling": the picker shows `Auto (720p)` (the level is capped to the player size).
4. Pick a custom throttle profile of about 1200 kbps. Within about 25 s the requests switch to `360p/`, and
   the picture follows once the buffered 720p runs out.
5. Seek far ahead. The first request is the segment holding that time (`seg_NNN` = seconds / 4), with
   nothing in between.
6. Pin 720p: only `720p/` requests from then on, slow but obeyed. Back to Auto, then "No throttling", and
   it climbs again.
7. Open the same video in a private window: every segment already fetched shows `HIT`.

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

```bash
# Linux / macOS
docker pull <registry>/mwader/static-ffmpeg:latest
./infra/retag-images.sh <registry>
```

On Linux the container runs as your user (`--user <uid>:<gid>`, read from the owner of the work directory),
so the segments it writes are not left owned by root. Windows and macOS Docker Desktop map ownership
themselves; there `--user` is only added where the OS has Unix ids.

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

## 8. Run the search service

Needs Kafka and Elasticsearch running (step 3). Swagger UI: <http://localhost:3003/docs>.

```bash
pnpm start:l:search
```

On start it creates the index `videos-v1` behind the alias `videos` (if it is missing), then reads
`yt.video-events` as consumer group `search-service`. Every `video.ready` becomes a document keyed by the
video id. A video is searchable about a second after it turns `READY`. Requests to try are in
`http/search-service.http` (API) and `http/elasticsearch.http` (index).

| Variable                   | Default                 | Purpose                                          |
| -------------------------- | ----------------------- | ------------------------------------------------ |
| `PORT`                     | `3003`                  | HTTP port                                        |
| `KAFKA_BROKERS`            | `localhost:9094`        | Kafka bootstrap list                             |
| `KAFKA_VIDEO_EVENTS_TOPIC` | `yt.video-events`       | Topic to index; dead letters go to `<topic>.dlt` |
| `KAFKA_GROUP_ID`           | `search-service`        | Consumer group (where reading resumes)           |
| `ELASTICSEARCH_URL`        | `http://localhost:9200` | Elasticsearch                                    |
| `SEARCH_INDEX`             | `videos`                | Alias the API reads; the index is `<alias>-v1`   |

What happens when things go wrong:

- **Elasticsearch down:** the consumer retries the same event (1 s, doubling, up to 30 s) and does not move
  on, so nothing is skipped. Search requests fail until it is back; new events are indexed afterwards.
- **Kafka down:** search keeps answering from the index; the consumer reconnects with backoff.
- **A malformed event:** it goes to `yt.video-events.dlt` with the headers `dlt-reason`, `dlt-source`
  (`topic/partition@offset`) and `dlt-consumer`, and the consumer continues. Read it with
  `kafka-console-consumer.sh --topic yt.video-events.dlt --from-beginning --property print.headers=true`.
- **Duplicates and replays:** the document version is the event's `occurredAt`, so a repeated or older
  event changes nothing.

Rebuild the index from Kafka (e.g. after a mapping change). The topic is compacted, so it still holds the
latest event of every video:

```bash
# stop the search service first, then:
curl -X DELETE http://localhost:9200/videos-v1
docker exec yt-kafka kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group search-service --topic yt.video-events --reset-offsets --to-earliest --execute
pnpm start:l:search   # recreates the index and re-reads every event
```

Using a new `KAFKA_GROUP_ID` instead of resetting has the same effect and leaves the old group untouched.

## 9. Run the notification service

Needs Kafka running (step 3); Keycloak for signed-in sockets.

```bash
pnpm start:l:notify
```

It holds WebSocket connections at `ws://localhost:3004/ws` (the web app reaches it as `/ws` through the Vite
proxy) and pushes a message for every new `video.ready` on `yt.video-events`:

| Who                      | Message           | Web app shows           |
| ------------------------ | ----------------- | ----------------------- |
| The uploader (signed in) | `video.ready`     | Your video "…" is ready |
| Everyone else            | `video.published` | New video: …            |

- A socket is anonymous until it sends `{ "event": "auth", "data": { "token": "<access token>" } }`; the
  token is verified against Keycloak (issuer and audience `yt-api`). Tokens never go in the URL.
- Every instance joins Kafka with its **own** consumer group (`notification-service-<random>`), reads only
  new events (`latest`) and never commits, because each instance must push every event to its own sockets.
  Compare search-service, where all instances share one group and split the work. List them with
  `kafka-consumer-groups.sh --list`.
- The same `eventId` is pushed once (the outbox can deliver twice), and events older than
  `NOTIFY_MAX_EVENT_AGE_SECONDS` (default 600) are dropped.
- Dead connections are found by a ping every 30 s and closed if the pong never comes.
- `GET /health` reports the number of open sockets. Requests to try: `http/notification-service.http`.

## Kubernetes (kind + Helm) — ⏸ pending

Ready but not yet run: it needs the `kindest/node:v1.37.0` image (see [TASKS.md](TASKS.md)). `pnpm k8s:check`
already validates the chart without a cluster: Helm lint plus 45 checks on the rendered manifests.

```bash
pnpm images:build
pnpm start:l:pods                                      # infrastructure stays in Docker Compose
kind create cluster --config infra/kind/cluster.yaml   # 1 control plane + 2 workers
pwsh -File infra/kind/connect-infra.ps1                # or ./infra/kind/connect-infra.sh
pwsh -File infra/kind/load-images.ps1                  # or ./infra/kind/load-images.sh
pnpm k8s:check                                         # also builds the chart dependencies
helm upgrade --install yt infra/helm/youtube-clone -n mini-youtube --create-namespace
```

The app is then at <http://localhost:8090>. kind maps node port 30090 there.

- **Chart layout:** `infra/helm/youtube-clone` is the umbrella chart, with one subchart per service in
  `charts/`. All of them use the library chart `infra/helm/yt-common`, so Deployment, Service,
  ConfigMap, Secret and HPA are written once. `global.env` and `global.secretEnv` hold shared settings;
  `global.imageRegistry` and `global.imageTag` retarget every image.
- **Infrastructure:** it runs in Compose, not in the cluster. `connect-infra` joins those containers to
  kind's network under their compose names, so the chart uses the same addresses as
  `docker-compose-local-apps.yaml`.
- **Migrations:** a Helm pre-install/pre-upgrade hook Job (`upload-service-migrate`) runs
  `prisma migrate deploy` before new pods start.
- **CPU/memory autoscaling:** HPAs for the upload, transcoder and notification services. They need
  metrics-server in the cluster, which is not installed yet (no image).
- **Queue-depth autoscaling:** `--set transcoder-service.queueScaling.enabled=true` renders a KEDA
  `ScaledObject` on `transcoder.transcode-video`, and the CPU HPA steps aside. It needs KEDA in the
  cluster.
- **Image loading:** `load-images` uses `ctr import --no-unpack` rather than `kind load docker-image`,
  because BuildKit images carry an attestation manifest that the default import rejects on Docker
  Desktop.

## Load tests (k6) — ⏸ pending

Written and typechecked (`pnpm load:check`, against `@types/k6`). Running them needs k6. k6 runs
TypeScript directly, and every script defaults to `BASE_URL=http://localhost:8090`.

| Script                     | What it does                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `tests/load/smoke.ts`      | 1 user, 30 s, every read path; p95 < 500 ms, < 1 % errors                          |
| `tests/load/cpu.ts`        | Arrival rate ramps to `PEAK_RPS` (200) and holds 5 min: watch `kubectl get hpa -w` |
| `tests/load/throughput.ts` | `UPLOADS` (20) real uploads, 5 at a time: time-to-READY, queue depth, DLQ          |

```bash
k6 run tests/load/smoke.ts
k6 run tests/load/cpu.ts -e PEAK_RPS=300
k6 run tests/load/throughput.ts -e VIDEO=tmp/sample.mp4 -e UPLOADS=30
```

## Observability

Only in the [with observability](#with-observability) mode.

`pnpm start:lo:pods` starts the same stack plus `yt-lgtm` (`grafana/otel-lgtm:1.3`): an OpenTelemetry
Collector in front of Tempo (traces), Prometheus (metrics) and Loki (logs), with Grafana on top.
`infra/docker-compose-local-observability.yaml` includes the local file, so there is only one place to
change the stack. `pnpm stop:lo:pods` stops everything.

| Item         | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Grafana      | <http://localhost:3000> (`admin` / `admin`)                           |
| OTLP         | `http://localhost:4318` (HTTP), `localhost:4317` (gRPC)               |
| Data sources | Tempo, Prometheus, Loki (provisioned; trace ids link logs and traces) |
| Retention    | In the container only; recreating it starts empty                     |

Run the services with telemetry by using the `lo` scripts instead of `l`:

```bash
pnpm start:lo:upload
pnpm start:lo:transcoder
pnpm start:lo:search
pnpm start:lo:notify
pnpm start:l:web   # the browser is not instrumented
```

The Node services load `@yt/telemetry/register` before the app (`--import`), and it does nothing unless
`APP_ENV=local-observability`. The `dev:lo` scripts get that from `.env.observability`, loaded after
`.env.sample`, where the later file wins. The transcoder gets the `local-observability` Spring profile.
Each service then sends traces, metrics (every 10 s) and logs, with trace ids, to `http://localhost:4318`.
Set `OTEL_ENABLED=true` to force it on in any environment, or `OTEL_ENABLED=false` to force it off.

Follow one upload: every outbox row stores the trace it was written in, so

```sql
select type, trace_context->>'traceparent' from outbox order by created_at desc limit 2;
```

gives `00-<trace id>-<span id>-01`. Paste the trace id into Grafana → Explore → Tempo. The trace runs
from `POST /uploads/:videoId/complete` through the RabbitMQ command, the transcoder, the status event and
the Kafka `video.ready` to search and notifications. In Explore → Loki, `{service_name=~".+"} | trace_id="<id>"`
shows the log lines of the same journey.

Grafana → Dashboards → **Mini YouTube → Mini YouTube - pipeline** (provisioned from
`infra/observability/dashboards/`) shows:

- HTTP rate, p95 latency and 5xx for every service.
- The outbox backlog (`yt_outbox_pending`) and publishes by type and outcome. A growing backlog means a
  broker is down.
- Transcode job duration and rate.
- Search events by outcome. `dead-letter` above 0 means bad events are landing on the DLT.
- Notifications delivered or ignored, and open sockets.
- Views recorded, by Redis or Postgres fallback, and flushed.
- Runtime health: Node event loop, JVM heap, DB p95.
- A table of recent upload traces and a Loki panel of warnings and errors.

The image's own RED and JVM dashboards are there too. Edit a panel in Grafana, then export the JSON over
the file to keep the change; provisioned dashboards are read-only.

## Local service URLs & credentials

| Service        | URL                                     | Credentials                                             |
| -------------- | --------------------------------------- | ------------------------------------------------------- |
| Upload service | <http://localhost:3001>                 | Keycloak bearer token (see `http/keycloak.http`)        |
| Transcoder     | <http://localhost:3002/actuator/health> | none                                                    |
| Search service | <http://localhost:3003/docs>            | none (public, read-only)                                |
| Notifications  | `ws://localhost:3004/ws`                | optional Keycloak token in an `auth` message            |
| Postgres       | `localhost:5432`                        | user `yt` / password `yt_password` / db `youtube_clone` |
| MinIO S3 API   | <http://localhost:9000>                 | `minioadmin` / `minioadmin`                             |
| MinIO Console  | <http://localhost:9001>                 | `minioadmin` / `minioadmin`                             |
| HLS edge       | <http://localhost:8088/healthz>         | none (public, read-only)                                |
| Kafka          | `localhost:9094` (bootstrap)            | none (PLAINTEXT, local only)                            |
| Elasticsearch  | <http://localhost:9200>                 | none (security off, local only)                         |
| Redis          | `localhost:6379`                        | none (local only)                                       |

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
