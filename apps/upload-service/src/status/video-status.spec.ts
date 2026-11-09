import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Channel } from "amqplib";
import { type VideoReadyEvent, videoEventsJsonSchema, videoReadyEventSchema } from "@yt/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { VIDEO_EVENTS_FILE, VIDEO_STATUS_FILE } from "../contracts/contract-files.js";
import { toKafkaMessage } from "../messaging/kafka-video-events.adapter.js";
import { declareStatusTopology } from "../messaging/transcode-topology.js";
import {
  type VideoStatusEvent,
  videoStatusEventJsonSchema,
} from "../messaging/video-status-event.js";
import { FakeVideoCache } from "../testing/fake-cache.js";
import { FakePrisma } from "../testing/fake-prisma.js";
import { handleDelivery } from "./amqp-video-status.consumer.js";
import { VideoStatusService } from "./video-status.service.js";

let prisma: FakePrisma;
let cache: FakeVideoCache;
let service: VideoStatusService;

beforeEach(() => {
  prisma = new FakePrisma();
  cache = new FakeVideoCache();
  service = new VideoStatusService(prisma.asPrismaService(), cache);
});

const video = (status: string) =>
  prisma.seed({
    title: "t",
    rawBucket: "raw-videos",
    rawKey: "k",
    contentType: "video/mp4",
    status: status as never,
  });

const event = (videoId: string, overrides: Partial<VideoStatusEvent> = {}): VideoStatusEvent => ({
  messageId: randomUUID(),
  videoId,
  status: "PROCESSING",
  masterPlaylist: null,
  renditions: [],
  reason: null,
  occurredAt: new Date().toISOString(),
  ...overrides,
});

const ready = (videoId: string) =>
  event(videoId, {
    status: "READY",
    masterPlaylist: `${videoId}/hls/master.m3u8`,
    renditions: [
      { name: "360p", key: `${videoId}/hls/360p/index.m3u8` },
      { name: "720p", key: `${videoId}/hls/720p/index.m3u8` },
    ],
  });

describe("VideoStatusService", () => {
  it("moves an uploaded video through processing to ready and stores the renditions", async () => {
    const { id } = video("UPLOADED");

    expect(await service.apply(event(id))).toBe(true);
    expect(prisma.rows.get(id)?.status).toBe("PROCESSING");

    expect(await service.apply(ready(id))).toBe(true);
    expect(prisma.rows.get(id)).toMatchObject({
      status: "READY",
      renditions: ready(id).renditions,
      hlsMasterKey: `${id}/hls/master.m3u8`,
      failureReason: null,
    });
  });

  it("ignores a late PROCESSING after READY, and duplicates", async () => {
    const { id } = video("UPLOADED");
    await service.apply(ready(id));

    expect(await service.apply(event(id))).toBe(false);
    expect(await service.apply(ready(id))).toBe(false);
    expect(prisma.rows.get(id)?.status).toBe("READY");
  });

  it("records the reason on FAILED and lets a later READY recover it", async () => {
    const { id } = video("PROCESSING");

    await service.apply(event(id, { status: "FAILED", reason: "not a video" }));
    expect(prisma.rows.get(id)).toMatchObject({ status: "FAILED", failureReason: "not a video" });

    await service.apply(ready(id));
    expect(prisma.rows.get(id)).toMatchObject({ status: "READY", failureReason: null });
  });

  it("does not touch a pending video or an unknown id", async () => {
    const { id } = video("PENDING");

    expect(await service.apply(ready(id))).toBe(false);
    expect(prisma.rows.get(id)?.status).toBe("PENDING");
    expect(await service.apply(ready(randomUUID()))).toBe(false);
  });
});

describe("video.ready in the outbox", () => {
  const outboxRows = () => [...prisma.outbox.values()];

  it("writes one contract-valid event with the status change", async () => {
    const { id, createdAt } = prisma.seed({
      title: "Cats",
      description: "Two cats",
      ownerId: "user-alice",
      rawBucket: "raw-videos",
      rawKey: "k",
      contentType: "video/mp4",
      status: "PROCESSING",
    });
    const e = ready(id);

    await service.apply(e);

    expect(outboxRows()).toHaveLength(1);
    const [row] = outboxRows();
    expect(row?.type).toBe("video.ready.v1");
    const event = videoReadyEventSchema.parse(row?.payload);
    expect(event).toEqual({
      eventId: row?.id,
      type: "video.ready",
      version: 1,
      occurredAt: e.occurredAt,
      video: {
        id,
        title: "Cats",
        description: "Two cats",
        ownerId: "user-alice",
        renditions: ["720p", "360p"],
        createdAt: createdAt.toISOString(),
      },
    });
  });

  it("writes nothing for PROCESSING, FAILED, or a duplicate READY", async () => {
    const { id } = video("UPLOADED");
    await service.apply(event(id));
    await service.apply(event(id, { status: "FAILED", reason: "x" }));
    expect(outboxRows()).toHaveLength(0);

    await service.apply(ready(id));
    await service.apply(ready(id));
    expect(outboxRows()).toHaveLength(1);
  });

  it("rolls back the status change when the event cannot be written", async () => {
    const { id } = video("PROCESSING");
    prisma.outboxMessage.create = () => Promise.reject(new Error("db down"));

    await expect(service.apply(ready(id))).rejects.toThrow("db down");
    expect(prisma.rows.get(id)?.status).toBe("PROCESSING");
  });
});

describe("toKafkaMessage", () => {
  it("keys by video id and carries the type and id as headers", () => {
    const e: VideoReadyEvent = {
      eventId: randomUUID(),
      type: "video.ready",
      version: 1,
      occurredAt: new Date().toISOString(),
      video: {
        id: randomUUID(),
        title: "t",
        description: null,
        ownerId: null,
        renditions: ["360p"],
        createdAt: new Date().toISOString(),
      },
    };

    expect(toKafkaMessage("yt.video-events", e)).toEqual({
      topic: "yt.video-events",
      key: e.video.id,
      value: JSON.stringify(e),
      headers: { "event-type": "video.ready", "event-id": e.eventId },
    });
  });
});

describe("handleDelivery", () => {
  const logger = { warn: () => undefined, error: () => undefined };
  const body = (value: unknown) => Buffer.from(JSON.stringify(value));

  it("acks a valid event after the handler ran", async () => {
    const seen: VideoStatusEvent[] = [];
    const e = event(randomUUID());

    expect(await handleDelivery(body(e), async (x) => seen.push(x), logger)).toBe("ack");
    expect(seen).toEqual([e]);
  });

  it("dead-letters malformed or invalid events without calling the handler", async () => {
    let calls = 0;
    const handler = async () => calls++;

    expect(await handleDelivery(Buffer.from("{nope"), handler, logger)).toBe("dead-letter");
    expect(
      await handleDelivery(body({ ...event(randomUUID()), status: "DONE" }), handler, logger),
    ).toBe("dead-letter");
    expect(await handleDelivery(body({ ...event(randomUUID()), extra: 1 }), handler, logger)).toBe(
      "dead-letter",
    );
    expect(calls).toBe(0);
  });

  it("requeues when applying fails, so the event is not lost", async () => {
    const failing = async () => {
      throw new Error("db down");
    };

    expect(await handleDelivery(body(event(randomUUID())), failing, logger)).toBe("requeue");
  });
});

describe("status contract and topology", () => {
  it("matches the committed contracts/video-status.schema.json", async () => {
    const committed = JSON.parse(await readFile(VIDEO_STATUS_FILE, "utf8"));
    expect(videoStatusEventJsonSchema()).toEqual(committed);
  });

  it("matches the committed contracts/video-events.schema.json", async () => {
    const committed = JSON.parse(await readFile(VIDEO_EVENTS_FILE, "utf8"));
    expect(videoEventsJsonSchema()).toEqual(committed);
  });

  it("declares the queue the transcoder publishes to, with its own DLQ", async () => {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      async (...args: unknown[]) => {
        calls.push([name, ...args]);
      };
    const channel = {
      assertExchange: record("exchange"),
      assertQueue: record("queue"),
      bindQueue: record("bind"),
    } as unknown as Channel;

    await declareStatusTopology(channel);

    expect(calls).toContainEqual(["exchange", "yt.video-status", "direct", { durable: true }]);
    expect(calls).toContainEqual([
      "queue",
      "upload-service.video-status",
      {
        durable: true,
        arguments: {
          "x-queue-type": "quorum",
          "x-dead-letter-exchange": "yt.video-status.dlx",
          "x-dead-letter-routing-key": "video.status",
        },
      },
    ]);
    expect(calls).toContainEqual([
      "bind",
      "upload-service.video-status",
      "yt.video-status",
      "video.status",
    ]);
    expect(calls).toContainEqual([
      "bind",
      "upload-service.video-status.dlq",
      "yt.video-status.dlx",
      "video.status",
    ]);
  });
});
