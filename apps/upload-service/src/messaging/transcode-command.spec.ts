import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { TRANSCODE_COMMAND_FILE } from "../contracts/contract-files.js";
import { transcodeCommandJsonSchema, transcodeCommandSchema } from "./transcode-command.js";

const valid = {
  messageId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  videoId: "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
  sourceBucket: "raw-videos",
  sourceKey: "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d/source.mp4",
  contentType: "video/mp4",
  requestedAt: "2026-11-08T10:00:00.000Z",
};

describe("transcode command contract", () => {
  it("matches the committed contracts/transcode-command.schema.json", async () => {
    const committed = JSON.parse(await readFile(TRANSCODE_COMMAND_FILE, "utf8"));
    expect(transcodeCommandJsonSchema()).toEqual(committed);
  });

  it("requires every field and rejects unknown ones", () => {
    expect(transcodeCommandSchema.parse(valid)).toEqual(valid);
    expect(transcodeCommandSchema.safeParse({ ...valid, videoId: "nope" }).success).toBe(false);
    expect(transcodeCommandSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    const { sourceKey: _omitted, ...missing } = valid;
    expect(transcodeCommandSchema.safeParse(missing).success).toBe(false);
  });
});
