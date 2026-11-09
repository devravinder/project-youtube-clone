import { beforeEach, describe, expect, it } from "vitest";
import { incoming, readyEvent } from "../testing/events.js";
import { FakeSearchIndex } from "../testing/fake-search-index.js";
import {
  EventProcessor,
  type IncomingEvent,
  retryDelayMs,
  StoppedError,
} from "./event-processor.js";
import { handleVideoEvent, toDocument } from "./video-event-handler.js";

let index: FakeSearchIndex;

beforeEach(() => {
  index = new FakeSearchIndex();
});

describe("handleVideoEvent", () => {
  it("indexes a video.ready by video id, with occurredAt as the version", async () => {
    const e = readyEvent();

    expect(await handleVideoEvent(JSON.stringify(e), "video.ready", index)).toEqual({
      kind: "indexed",
    });
    expect(index.docs.get(e.video.id)).toEqual({
      version: Date.parse(e.occurredAt),
      document: toDocument(e),
    });
    expect(toDocument(e).readyAt).toBe(e.occurredAt);
  });

  it("reports a duplicate or older event as stale and keeps the newer document", async () => {
    const e = readyEvent();
    await handleVideoEvent(JSON.stringify(e), "video.ready", index);
    const older = {
      ...e,
      occurredAt: "2026-11-09T09:00:00.000Z",
      video: { ...e.video, title: "Old" },
    };

    expect(await handleVideoEvent(JSON.stringify(e), "video.ready", index)).toEqual({
      kind: "stale",
    });
    expect(await handleVideoEvent(JSON.stringify(older), undefined, index)).toEqual({
      kind: "stale",
    });
    expect(index.docs.get(e.video.id)?.document.title).toBe("Cats playing piano");
  });

  it("skips event types it does not index, without parsing them", async () => {
    expect(await handleVideoEvent("not json", "video.deleted", index)).toMatchObject({
      kind: "skipped",
    });
  });

  it("dead-letters values that are not JSON or break the contract", async () => {
    expect(await handleVideoEvent("{nope", "video.ready", index)).toEqual({
      kind: "dead-letter",
      reason: "value is not JSON",
    });
    const bad = await handleVideoEvent(
      JSON.stringify({ ...readyEvent(), video: { ...readyEvent().video, renditions: [] } }),
      "video.ready",
      index,
    );
    expect(bad.kind).toBe("dead-letter");
    expect(bad).toMatchObject({ reason: expect.stringContaining("video.renditions") });
    expect(index.docs.size).toBe(0);
  });

  it("ignores fields it does not know (tolerant reader)", async () => {
    const e = { ...readyEvent(), extra: 1, video: { ...readyEvent().video, durationSeconds: 9 } };

    expect(await handleVideoEvent(JSON.stringify(e), "video.ready", index)).toEqual({
      kind: "indexed",
    });
  });

  it("throws index errors so the caller retries", async () => {
    index.failWith = new Error("es down");

    await expect(
      handleVideoEvent(JSON.stringify(readyEvent()), "video.ready", index),
    ).rejects.toThrow("es down");
  });
});

describe("EventProcessor", () => {
  const sleeps: number[] = [];
  const dead: { event: IncomingEvent; reason: string }[] = [];
  let processor: EventProcessor;

  beforeEach(() => {
    sleeps.length = 0;
    dead.length = 0;
    processor = new EventProcessor(
      index,
      async (event, reason) => {
        dead.push({ event, reason });
      },
      async (ms) => {
        sleeps.push(ms);
      },
    );
  });

  it("indexes, then commits", async () => {
    const e = incoming(readyEvent());

    expect(await processor.process(e)).toEqual({ kind: "indexed" });
    expect(e.commits).toBe(1);
    expect(index.docs.size).toBe(1);
  });

  it("keeps retrying with backoff while the index is down, and commits only after success", async () => {
    const e = incoming(readyEvent());
    let calls = 0;
    const original = index.upsert.bind(index);
    index.upsert = async (...args) => {
      calls++;
      if (calls < 4) throw new Error("es down");
      return original(...args);
    };

    expect(await processor.process(e)).toEqual({ kind: "indexed" });
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(e.commits).toBe(1);
  });

  it("dead-letters a bad event and moves on", async () => {
    const e = incoming("{nope");

    expect(await processor.process(e)).toMatchObject({ kind: "dead-letter" });
    expect(dead).toEqual([{ event: e, reason: "value is not JSON" }]);
    expect(e.commits).toBe(1);
  });

  it("commits skipped and stale events too, so they are not re-read", async () => {
    const skipped = incoming("x", { "event-type": "video.deleted" });
    const ready = readyEvent();
    await processor.process(incoming(ready));
    const duplicate = incoming(ready);

    expect((await processor.process(skipped)).kind).toBe("skipped");
    expect((await processor.process(duplicate)).kind).toBe("stale");
    expect(skipped.commits + duplicate.commits).toBe(2);
  });

  it("stops retrying on shutdown without committing", async () => {
    index.failWith = new Error("es down");
    const e = incoming(readyEvent());
    processor = new EventProcessor(
      index,
      async () => undefined,
      async () => processor.stop(),
    );

    await expect(processor.process(e)).rejects.toBeInstanceOf(StoppedError);
    expect(e.commits).toBe(0);
  });

  it("caps the backoff at 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(retryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
});
