import { z } from "zod";

const schema = z
  .object({
    messageId: z.uuid(),
    videoId: z.uuid(),
    status: z.enum(["PROCESSING", "READY", "FAILED"]),
    masterPlaylist: z
      .string()
      .min(1)
      .nullable()
      .describe("Key of the HLS master playlist in the output bucket when READY, otherwise null"),
    renditions: z
      .array(
        z
          .object({
            name: z.string().regex(/^\d+p$/),
            key: z.string().min(1),
          })
          .strict(),
      )
      .describe("Every rendition when READY, otherwise empty"),
    reason: z.string().nullable().describe("Why it failed when FAILED, otherwise null"),
    occurredAt: z.iso.datetime(),
  })
  .strict()
  .meta({
    title: "VideoStatusEvent",
    description: "The transcoder reports progress for one video",
  });

// Source of contracts/video-status.schema.json, which the transcoder tests read.
export const videoStatusEventSchema = schema;
export type VideoStatusEvent = z.infer<typeof schema>;

export function videoStatusEventJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
