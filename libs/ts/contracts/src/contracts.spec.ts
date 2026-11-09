import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Parser } from "@asyncapi/parser";
import { describe, expect, it } from "vitest";
import { ASYNCAPI_FILE, renderAsyncApi } from "./asyncapi-file.js";
import { serverMessageSchema } from "./notifications.js";
import { videoEventSchema, videoReadyEventSchema } from "./video-events.js";

const ready = {
  eventId: randomUUID(),
  type: "video.ready",
  version: 1,
  occurredAt: "2026-11-09T10:00:00.000Z",
  video: {
    id: randomUUID(),
    title: "Cats",
    description: null,
    ownerId: "u1",
    renditions: ["720p", "360p"],
    createdAt: "2026-11-09T09:00:00.000Z",
  },
};

describe("AsyncAPI document", () => {
  it("matches the committed contracts/asyncapi.json (run pnpm api:generate)", async () => {
    expect(await readFile(ASYNCAPI_FILE, "utf8")).toBe(renderAsyncApi());
  });

  it("is valid AsyncAPI 3.1 according to the official parser", async () => {
    const { document, diagnostics } = await new Parser().parse(renderAsyncApi());
    // Severity 0 = error; warnings (style hints) are allowed.
    const errors = diagnostics.filter((d) => d.severity === 0);

    expect(errors.map((d) => `${d.path.join(".")}: ${d.message}`)).toEqual([]);
    expect(document?.version()).toBe("3.1.0");
    expect(
      document
        ?.channels()
        .all()
        .map((c) => c.address()),
    ).toEqual(["yt.video-events", "yt.video-events.dlt", "/ws"]);
    expect(
      document
        ?.operations()
        .all()
        .map((o) => o.id()),
    ).toEqual([
      "publishVideoReady",
      "indexVideoEvents",
      "deadLetterVideoEvents",
      "notifyVideoEvents",
      "receiveAuth",
      "pushNotifications",
    ]);
  });
});

describe("event schemas", () => {
  it("accepts a valid video.ready and ignores unknown fields (tolerant reader)", () => {
    expect(videoEventSchema.parse(ready)).toEqual(ready);
    const extended = { ...ready, extra: 1, video: { ...ready.video, durationSeconds: 3 } };
    expect(videoReadyEventSchema.parse(extended)).toEqual(ready);
  });

  it("rejects what would break consumers", () => {
    for (const bad of [
      { ...ready, eventId: "x" },
      { ...ready, version: 2 },
      { ...ready, type: "video.deleted" },
      { ...ready, video: { ...ready.video, renditions: [] } },
      { ...ready, video: { ...ready.video, renditions: ["hd"] } },
      { ...ready, video: { ...ready.video, title: "" } },
    ]) {
      expect(videoEventSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("accepts only the server messages the browser understands", () => {
    const data = { videoId: ready.video.id, title: "Cats" };
    expect(serverMessageSchema.parse({ event: "video.published", data }).event).toBe(
      "video.published",
    );
    expect(serverMessageSchema.safeParse({ event: "video.deleted", data }).success).toBe(false);
    expect(
      serverMessageSchema.safeParse({ event: "auth", data: { ok: "yes", userId: null } }).success,
    ).toBe(false);
  });
});
