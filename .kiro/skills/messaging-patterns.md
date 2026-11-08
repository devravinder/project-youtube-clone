---
name: messaging-patterns
description: Apply RabbitMQ (command queue) vs Kafka (event log) correctly, with transactional outbox, idempotent consumers, retries, and DLQs. Use when designing or implementing any asynchronous messaging.
---

# Messaging Patterns — RabbitMQ (commands) + Kafka (events)

Use the right tool for the right job. The two are **not** interchangeable.

## Decision rule

| Job                                                      | Semantics                                       | Tool             |
| -------------------------------------------------------- | ----------------------------------------------- | ---------------- |
| "Do this work" (one job → one worker)                    | work queue: ack, retry, DLQ, prefetch           | **RabbitMQ**     |
| "This happened" (one event → many consumers, replayable) | event log: partitions, offsets, consumer groups | **Apache Kafka** |

In this project: RabbitMQ carries the **transcode command**; Kafka carries the
**`video.ready` event** fanned out to search + notifications.

## RabbitMQ (command queue)

- **Ack after success**; reject → retry or route to **DLQ**. In Spring, `AcknowledgeMode.AUTO` acks when the
  listener returns and rejects when it throws; set `default-requeue-rejected: false` so a poison message is
  dead-lettered instead of redelivered forever.
- **Prefetch** limits in-flight messages per consumer = back-pressure (1 for heavy jobs like transcoding).
- One queue, **competing consumers** = horizontal scale.
- Scale worker count (or k8s replicas via HPA) by queue depth.
- Prefer **quorum queues** (replicated, durable, support delivery limits) over classic queues.
- **Publisher confirms**: a publish is done only after the broker confirms it (`createConfirmChannel` in
  amqplib). Without confirms a "successful" publish can still be lost.
- **Topology on both sides**: producer and consumer declare the same exchange, queue and bindings with
  identical arguments, so either can start first. Different arguments → `PRECONDITION_FAILED`; pin them with a
  test on each side.

### Before the outbox exists

Publish **first**, then update the row. A failed publish leaves the row unchanged so the client can retry
(the API answers 503); a failed update after a publish leads to a duplicate on retry, which an idempotent
consumer absorbs. The reverse order (update, then publish) silently loses jobs.

In this project: exchange `yt.transcode` (direct), routing key `transcode.cmd`, queue
`transcoder.transcode-video`, DLX `yt.transcode.dlx`, DLQ `transcoder.transcode-video.dlq`. Names live in
`apps/upload-service/src/messaging/transcode-topology.ts` and `adapter/in/messaging/TranscodeTopology.java`.

```mermaid
flowchart LR
  P[Producer] -->|transcode.cmd| Q[[work queue]]
  Q --> W1[worker]
  Q --> W2[worker]
  W1 -. nack .-> DLQ[[dead-letter]]
```

## Kafka (event log)

- **Partitions** give ordering per key (e.g. per videoId) and parallelism.
- **Consumer groups** read independently; add a new group later to **replay history**
  (backfill a brand-new service without touching producers).
- Commit offsets after processing.

```mermaid
flowchart LR
  TR[Transcoder] -->|video.ready| K[[Kafka topic]]
  K --> G1[search indexer group]
  K --> G2[notification group]
  K --> G3[future: analytics group]
```

## Transactional outbox (the dual-write problem)

Never write to the DB **and** publish an event as two independent steps — one can fail.
Instead: within the same DB transaction, write the domain row **and** an `outbox` row. A
relay (poller or CDC) publishes outbox rows to Kafka, then marks them sent.

```mermaid
sequenceDiagram
  participant S as Service
  participant DB as Postgres
  participant R as Outbox relay
  participant K as Kafka
  S->>DB: TX { update video; insert outbox(video.ready) }
  R->>DB: poll unsent outbox
  R->>K: publish video.ready
  R->>DB: mark outbox sent
```

## Idempotency (mandatory)

Both RabbitMQ and Kafka are **at-least-once** — the same message can arrive twice.
Every consumer must be idempotent:

- Dedupe by a stable key (messageId / eventId) stored in a processed-ids table, or
- Make the operation naturally idempotent (upsert by videoId, not insert).

## Retries & DLQ

- Retry with backoff a bounded number of times.
- After max retries, route to a DLQ for inspection — never silently drop.
- Alert/observe DLQ depth.

## Contracts

- Generate the message JSON Schema from the producer's Zod schema into `contracts/<message>.schema.json`
  (same `pnpm api:generate` as OpenAPI). The Java side tests its record against that file, so drift on either
  side fails a build. Example: `contracts/transcode-command.schema.json`.
- Give every message a `messageId` and an ISO timestamp; set them as AMQP properties too.
- AsyncAPI (`@asyncapi/cli`) is the next step once there are several channels.
