import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeVideo, encodeVideo } from "../cache/video-cache.js";
import { RedisTimeoutError, RedisUnavailableError } from "../cache/redis.client.js";
import { createTestApp, type TestApp } from "../testing/test-app.js";
import { testConfig } from "../testing/test-data.js";
import { VideosService } from "./videos.service.js";
import { viewerKey, ViewsService } from "./views.service.js";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(() => {
  t.prisma.reset();
  t.cache.entries.clear();
  t.cache.evicted.length = 0;
  t.views.counts.clear();
  t.views.seen.clear();
  t.views.failWith = null;
});
afterEach(() => vi.restoreAllMocks());

const seed = (status = "READY", viewCount = 0n) =>
  t.prisma.seed({
    title: "Cats",
    rawBucket: "raw-videos",
    rawKey: "k",
    contentType: "video/mp4",
    status: status as never,
    viewCount,
    hlsMasterKey: "v/hls/master.m3u8",
  });
const views = () => t.app.get(ViewsService);

describe("video row codec", () => {
  it("round-trips BigInt and Date columns through JSON", () => {
    const row = { ...seed(), viewCount: 12345678901234567890n, fileSize: 42n };
    const back = decodeVideo(encodeVideo(row));

    expect(back).toEqual(row);
    expect(back.createdAt).toBeInstanceOf(Date);
    expect(decodeVideo(encodeVideo({ ...row, fileSize: null })).fileSize).toBeNull();
  });
});

describe("cache-aside reads", () => {
  it("fills the cache on a miss and serves the next read from it", async () => {
    const { id } = seed();
    const db = vi.spyOn(t.prisma.video, "findUnique");

    expect((await t.http().get(`/videos/${id}`)).status).toBe(200);
    expect(db).toHaveBeenCalledTimes(1);
    expect(t.cache.entries.has(id)).toBe(true);

    const second = await t.http().get(`/videos/${id}`);
    expect(second.body.title).toBe("Cats");
    expect(db).toHaveBeenCalledTimes(1);
    expect(t.cache.hits).toBeGreaterThan(0);
  });

  it("caches the row, not the signed URL", async () => {
    const { id } = seed("FAILED");
    await t.storage.putObject("raw-videos", "k", Buffer.from("x"));

    const first = await t.http().get(`/videos/${id}`);
    const second = await t.http().get(`/videos/${id}`);

    expect(first.body.playbackUrl).toBeTruthy();
    expect(second.body.playbackUrl).toBeTruthy();
    expect([...t.cache.entries.values()].map(encodeVideo).join()).not.toContain("signature");
  });

  it("adds views still waiting in Redis to the stored count", async () => {
    const { id } = seed("READY", 10n);
    t.views.counts.set(id, 3);

    expect((await t.http().get(`/videos/${id}`)).body.viewCount).toBe(13);
  });

  it("evicts on confirm and abort", async () => {
    const created = (
      await t
        .as("alice")
        .post("/uploads/presign")
        .send({ filename: "a.mp4", contentType: "video/mp4" })
    ).body;
    await t.storage.putObject(created.bucket, created.key, Buffer.from("x"));
    await t.as("alice").post(`/uploads/${created.videoId}/complete`);
    expect(t.cache.evicted).toContain(created.videoId);

    const other = (
      await t
        .as("alice")
        .post("/uploads/presign")
        .send({ filename: "b.mp4", contentType: "video/mp4" })
    ).body;
    await t.as("alice").delete(`/uploads/${other.videoId}`);
    expect(t.cache.evicted).toContain(other.videoId);
  });
});

describe("POST /videos/:id/views", () => {
  it("counts the first view of a viewer and ignores repeats", async () => {
    const { id } = seed();

    const first = await t.http().post(`/videos/${id}/views`).set("user-agent", "ua-1");
    const again = await t.http().post(`/videos/${id}/views`).set("user-agent", "ua-1");
    const other = await t.http().post(`/videos/${id}/views`).set("user-agent", "ua-2");

    expect([first.status, first.body, again.body, other.body]).toEqual([
      202,
      { counted: true },
      { counted: false },
      { counted: true },
    ]);
    expect(t.views.counts.get(id)).toBe(2);
  });

  it("refuses videos that are not READY, unknown ids and bad ids", async () => {
    const { id } = seed("PROCESSING");

    expect((await t.http().post(`/videos/${id}/views`)).status).toBe(404);
    expect((await t.http().post(`/videos/${randomUUID()}/views`)).status).toBe(404);
    expect((await t.http().post("/videos/nope/views")).status).toBe(400);
  });

  it("writes straight to Postgres when Redis is down", async () => {
    const { id } = seed("READY", 5n);
    t.views.failWith = new RedisUnavailableError("down");

    expect((await t.http().post(`/videos/${id}/views`)).body).toEqual({ counted: true });
    expect(t.prisma.rows.get(id)?.viewCount).toBe(6n);
    expect(t.cache.evicted).toContain(id);
  });

  it("does not also write Postgres when Redis timed out, which could count twice", async () => {
    const { id } = seed("READY", 5n);
    t.views.failWith = new RedisTimeoutError("slow");

    expect((await t.http().post(`/videos/${id}/views`)).body).toEqual({ counted: true });
    expect(t.prisma.rows.get(id)?.viewCount).toBe(5n);
  });

  it("hashes the viewer, so no IP address is stored", () => {
    const key = viewerKey("203.0.113.9", "Firefox");

    expect(key).toHaveLength(22);
    expect(key).not.toContain("203");
    expect(viewerKey("203.0.113.9", "Firefox")).toBe(key);
    expect(viewerKey("203.0.113.10", "Firefox")).not.toBe(key);
  });
});

describe("view flush", () => {
  it("moves pending counts into Postgres and evicts the cached rows", async () => {
    const a = seed("READY", 10n);
    const b = seed("READY", 0n);
    t.views.counts.set(a.id, 3).set(b.id, 1);

    expect(await views().flush()).toBe(4);

    expect(t.prisma.rows.get(a.id)?.viewCount).toBe(13n);
    expect(t.prisma.rows.get(b.id)?.viewCount).toBe(1n);
    expect(t.views.counts.size).toBe(0);
    expect(t.cache.evicted).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it("gives counts back when Postgres fails, so no view is lost", async () => {
    const a = seed();
    t.views.counts.set(a.id, 7);
    vi.spyOn(t.prisma.video, "updateMany").mockRejectedValueOnce(new Error("db down"));

    expect(await views().flush()).toBe(0);
    expect(t.views.counts.get(a.id)).toBe(7);
  });

  it("leaves counts in Redis when Redis itself fails", async () => {
    t.views.failWith = new Error("down");

    expect(await views().flush()).toBe(0);
  });

  it("shares a flush in progress and runs once more on shutdown", async () => {
    const a = seed();
    t.views.counts.set(a.id, 2);

    const [x, y] = await Promise.all([views().flush(), views().flush()]);
    expect(x + y).toBe(4);
    expect(t.prisma.rows.get(a.id)?.viewCount).toBe(2n);

    t.views.counts.set(a.id, 1);
    await views().onApplicationShutdown();
    expect(t.prisma.rows.get(a.id)?.viewCount).toBe(3n);
  });

  it("flushes on its interval", async () => {
    vi.useFakeTimers();
    try {
      const service = new ViewsService(
        t.app.get(VideosService),
        t.views,
        t.cache,
        t.prisma.asPrismaService(),
        { ...testConfig, VIEW_FLUSH_INTERVAL_MS: 1000 },
      );
      const a = seed();
      t.views.counts.set(a.id, 1);
      service.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(1000);
      expect(t.prisma.rows.get(a.id)?.viewCount).toBe(1n);
      await service.onApplicationShutdown();
    } finally {
      vi.useRealTimers();
    }
  });
});
