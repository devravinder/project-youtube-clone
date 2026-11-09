import { z } from "zod";

// Topics are created by infra (kafka-setup); services only read and write them.
export const VIDEO_EVENTS_TOPIC = "yt.video-events";
export const VIDEO_EVENTS_DLT = "yt.video-events.dlt";

// Headers let a consumer skip event types it does not know without parsing the value.
export const EVENT_TYPE_HEADER = "event-type";
export const EVENT_ID_HEADER = "event-id";

export const VIDEO_READY = "video.ready";

// Not strict: consumers ignore fields added later (tolerant reader), so producers can evolve first.
export const videoReadyEventSchema = z
  .object({
    eventId: z.uuid().describe("Unique per event; consumers dedupe on it"),
    type: z.literal(VIDEO_READY),
    version: z.literal(1),
    occurredAt: z.iso.datetime().describe("When the video became playable"),
    video: z.object({
      id: z.uuid(),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).nullable(),
      ownerId: z.string().nullable().describe("Keycloak subject of the uploader"),
      renditions: z
        .array(z.string().regex(/^\d+p$/))
        .min(1)
        .describe("Rendition names, highest first"),
      createdAt: z.iso.datetime(),
    }),
  })
  .meta({
    title: "VideoReadyEvent",
    description: "A video finished transcoding and can be played. Key: the video id.",
  });

export type VideoReadyEvent = z.infer<typeof videoReadyEventSchema>;

// Every event on yt.video-events; a union so new types can be added without a new topic.
export const videoEventSchema = z.discriminatedUnion("type", [videoReadyEventSchema]);
export type VideoEvent = z.infer<typeof videoEventSchema>;

export function videoEventsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(videoEventSchema, { io: "input" }) as Record<string, unknown>;
}
