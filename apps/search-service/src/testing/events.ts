import { randomUUID } from "node:crypto";
import type { VideoReadyEvent } from "@yt/contracts";
import type { IncomingEvent } from "../indexer/event-processor.js";

export const readyEvent = (overrides: Partial<VideoReadyEvent["video"]> = {}): VideoReadyEvent => ({
  eventId: randomUUID(),
  type: "video.ready",
  version: 1,
  occurredAt: "2026-11-09T10:00:00.000Z",
  video: {
    id: randomUUID(),
    title: "Cats playing piano",
    description: "Two cats",
    ownerId: "user-alice",
    renditions: ["720p", "360p"],
    createdAt: "2026-11-09T09:59:00.000Z",
    ...overrides,
  },
});

export const incoming = (
  value: unknown,
  headers: Record<string, string> = { "event-type": "video.ready" },
): IncomingEvent & { commits: number } => {
  const event = {
    topic: "t",
    partition: 1,
    offset: 7n,
    key: "k",
    value: typeof value === "string" ? value : JSON.stringify(value),
    headers: new Map(Object.entries(headers)),
    commits: 0,
    commit() {
      event.commits++;
    },
  };
  return event;
};
