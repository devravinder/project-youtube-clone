import type { TranscodeCommand } from "@yt/ports";
import { z } from "zod";

const schema = z
  .object({
    messageId: z.uuid(),
    videoId: z.uuid(),
    sourceBucket: z.string().min(1),
    sourceKey: z.string().min(1),
    contentType: z.string().min(1),
    requestedAt: z.iso.datetime(),
  })
  .strict()
  .meta({ title: "TranscodeCommand", description: "Asks the transcoder to process one video" });

// Source of contracts/transcode-command.schema.json, which the transcoder tests read.
export const transcodeCommandSchema: z.ZodType<TranscodeCommand> = schema;

export function transcodeCommandJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
