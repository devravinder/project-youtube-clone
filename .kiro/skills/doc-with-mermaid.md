---
name: doc-with-mermaid
description: Author documentation in Markdown and use Mermaid diagrams for all architecture and design visuals. Use when writing architecture, design, or flow docs.
---

# Documentation with Mermaid

## Rule

All documentation is **Markdown**. For **architecture and design** visuals, use **Mermaid**
diagrams embedded in the Markdown (not ASCII art, not external image files).

**Always follow the `markdown-lint` skill** when writing or editing any Markdown — every
`.md` file must pass markdownlint rules (notably MD040: every code fence declares a
language; use `mermaid` for diagrams).

## When to use which diagram

| Need | Mermaid diagram |
|------|-----------------|
| Service / component architecture | `flowchart` or `graph` |
| Request / message flow over time | `sequenceDiagram` |
| Data model / entities | `erDiagram` |
| State of a resource (e.g. video lifecycle) | `stateDiagram-v2` |
| Deployment topology (k8s, envs) | `flowchart` with subgraphs |
| Phases / milestones | `gantt` or `timeline` |

## Conventions

- One diagram per concept; keep it readable over exhaustive.
- Use `subgraph` to group by service, bucket, or environment.
- Label edges with the action/event (`presigned PUT`, `video.ready`).
- Keep node names short; explain detail in prose below the diagram.
- Always pair a diagram with a sentence or two of prose context.

## Examples

### Architecture (flowchart)

```mermaid
flowchart LR
  UI[React player] --> GW[API gateway]
  GW -->|presigned PUT| MinIO[(MinIO raw)]
  GW -->|enqueue| MQ[[RabbitMQ]]
  MQ --> TR[Transcoder ffmpeg]
  TR -->|HLS| HLS[(MinIO hls)]
  TR -->|video.ready| K[[Kafka]]
  K --> SE[Search indexer] --> ES[(Elasticsearch)]
  K --> NO[Notification svc] --> UI
```

### Flow (sequenceDiagram)

```mermaid
sequenceDiagram
  participant C as Client
  participant API
  participant S as MinIO
  participant Q as RabbitMQ
  C->>API: request upload URL
  API-->>C: presigned URL
  C->>S: PUT video bytes
  C->>API: confirm upload
  API->>Q: enqueue transcode job
  API-->>C: 202 Accepted (processing)
```

### Video lifecycle (stateDiagram)

```mermaid
stateDiagram-v2
  [*] --> Uploaded
  Uploaded --> Processing: job dequeued
  Processing --> Ready: HLS written + event emitted
  Processing --> Failed: error (retry/DLQ)
  Failed --> Processing: retry
  Ready --> [*]
```

### Data model (erDiagram)

```mermaid
erDiagram
  USER ||--o{ VIDEO : uploads
  VIDEO ||--o{ RENDITION : has
  VIDEO {
    uuid id
    string title
    string status
  }
  RENDITION {
    uuid id
    string resolution
    string playlist_url
  }
```
