# Architecture

System architecture for the Mini YouTube Clone. Diagrams use Mermaid (see the
`doc-with-mermaid` skill). This document holds the _how_; the _what/why_ is in
[`PRD.md`](PRD.md) and [`LEARNING-GOALS.md`](LEARNING-GOALS.md), and decisions are logged in
[`DECISIONS.md`](DECISIONS.md).

## 1. Context

```mermaid
flowchart LR
  Creator[Creator] --> UI
  Viewer[Viewer] --> UI
  UI[React SPA] --> GW[API gateway]
  GW --> KC[Keycloak OIDC]
  GW --> SYS[Mini YouTube backend]
```

Creators upload; viewers browse, search, watch, and get notified. Keycloak is the identity
authority; the backend is a set of open-source-backed microservices.

## 2. Service map

```mermaid
flowchart TB
  subgraph edge
    IG[nginx-ingress / edge cache]
  end
  subgraph node[NestJS services]
    GW[api-gateway]
    UP[upload-service]
    MD[metadata-service]
    SE[search-service]
    NO[notification-service]
  end
  subgraph jvm[Spring Boot]
    TR[transcoder-service]
  end
  subgraph data[stateful infra]
    PG[(Postgres)]
    R[(Redis)]
    MINIO[(MinIO)]
    MQ[[RabbitMQ]]
    K[[Kafka]]
    ES[(Elasticsearch)]
  end
  IG --> GW
  GW --> UP
  GW --> MD
  GW --> SE
  UP --> MINIO
  UP --> MQ
  UP --> PG
  MD --> PG
  MD --> R
  TR --> MQ
  TR --> MINIO
  TR --> K
  SE --> K
  SE --> ES
  NO --> K
```

- **api-gateway** — BFF: auth, routing, rate limiting, WebSocket relay.
- **upload-service** — presigned URLs, metadata write, enqueues transcode, writes outbox.
- **metadata-service** — video/channel CRUD (source of truth), cache reads.
- **transcoder-service** — RabbitMQ consumer, ffmpeg, writes HLS, emits `video.ready`.
- **search-service** — Kafka consumer → Elasticsearch indexer, query API.
- **notification-service** — Kafka consumer → WebSocket to viewers.

## 3. Upload → playable flow

```mermaid
sequenceDiagram
  participant C as Client
  participant GW as API gateway
  participant UP as upload-service
  participant S as MinIO
  participant Q as RabbitMQ
  participant TR as transcoder
  participant K as Kafka
  C->>GW: request upload URL
  GW->>UP: create video (status=Pending)
  UP-->>C: presigned PUT URL
  C->>S: PUT raw bytes
  C->>GW: confirm upload
  GW->>UP: confirm upload
  UP->>UP: TX { mark Uploaded; insert outbox(transcode.cmd) }
  UP-->>C: 201 Uploaded
  UP->>Q: outbox relay publishes transcode.cmd (retries until confirmed)
  Q->>TR: deliver job
  TR->>S: read raw
  TR->>S: write HLS renditions
  TR->>K: video.ready (via outbox)
  K->>C: notification (WebSocket) "ready"
```

## 4. Video lifecycle (state)

```mermaid
stateDiagram-v2
  [*] --> Pending
  Pending --> Uploaded: confirm upload
  Uploaded --> Processing: job dequeued
  Processing --> Ready: HLS written + video.ready emitted
  Processing --> Failed: error
  Failed --> Processing: retry (bounded)
  Failed --> Dead: max retries (DLQ)
  Ready --> [*]
```

## 5. Event fan-out

```mermaid
flowchart LR
  TR[transcoder] -->|video.ready| K[[Kafka topic]]
  K --> G1[search indexer group]
  K --> G2[notification group]
  K --> G3[future: analytics group]
```

One event, many independent consumer groups. A new consumer can replay history to backfill
without changing the producer. See the `messaging-patterns` skill.

## 6. Transactional outbox

```mermaid
sequenceDiagram
  participant S as service
  participant DB as Postgres
  participant RL as outbox relay
  participant K as Kafka
  S->>DB: TX { update video; insert outbox(video.ready) }
  RL->>DB: poll unsent outbox
  RL->>K: publish video.ready
  RL->>DB: mark sent
```

Avoids the dual-write problem: the DB change and the intent-to-publish commit atomically; a
relay forwards reliably. Consumers are idempotent because delivery is at-least-once.

## 7. Data model (core)

```mermaid
erDiagram
  CHANNEL ||--o{ VIDEO : owns
  VIDEO ||--o{ RENDITION : has
  VIDEO ||--o{ OUTBOX : emits
  VIDEO {
    uuid id
    uuid channel_id
    string title
    string description
    string status
    bigint view_count
  }
  RENDITION {
    uuid id
    uuid video_id
    string resolution
    string playlist_url
  }
  OUTBOX {
    uuid id
    string type
    jsonb payload
    boolean sent
  }
```

Postgres is the **source of truth**. Elasticsearch documents and Redis counts are _derived_
and rebuildable from it.

## 8. Streaming path

```mermaid
flowchart LR
  P[hls.js player] -->|manifest + segments| IG[nginx edge cache]
  IG -->|cache miss| HLS[(MinIO hls bucket)]
  IG -->|cache hit| P
```

Adaptive bitrate: the player reads a manifest and fetches segments at a quality matched to
bandwidth. nginx caches segments at the edge and serves byte-range requests for seeking.

## 9. Deployment (local k8s)

```mermaid
flowchart TB
  subgraph kind cluster
    IG[nginx-ingress]
    subgraph stateless[Deployments]
      GW[api-gateway]
      UP[upload-service]
      MD[metadata-service]
      SE[search-service]
      NO[notification-service]
      TR[transcoder + HPA]
    end
    subgraph stateful[StatefulSets + PVCs]
      PG[(Postgres)]
      K[(Kafka)]
      ES[(Elasticsearch)]
    end
  end
  IG --> GW
  TR -. scales on queue depth .-> MQ[[RabbitMQ]]
```

Stateless services are Deployments; data stores are StatefulSets. The transcoder autoscales
on RabbitMQ queue depth (HPA). See the `k8s-kind-helm` skill.

## 10. Cross-cutting

- **Config:** environment-driven, typed and validated (zod / Spring `AppProperties`).
- **Auth:** Keycloak-issued JWTs, verified at the gateway and services.
- **Observability:** OTLP from every service into grafana/otel-lgtm; one trace spans
  HTTP → RabbitMQ → Kafka. See the `observability-otel` skill.
- **Contracts:** OpenAPI (REST) + AsyncAPI (events) in `libs/ts/contracts`.
- **Patterns:** layered MVC for CRUD services; ports & adapters for infra-heavy services
  (transcoder, search, notification). See `ADR-011`.
