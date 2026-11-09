import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePrisma } from "../testing/fake-prisma.js";
import { connectRedis, type Redis, RedisGuard } from "./redis.client.js";
import { RedisVideoCache } from "./video-cache.js";
import { RedisViewCounter } from "./view-counter.js";

// Database 15: take() pops every dirty video, so never share a database with a running dev server.
const URL = process.env.REDIS_TEST_URL ?? "redis://localhost:6379/15";
const reachable = await new Promise<boolean>((resolve) => {
  const { hostname, port } = new globalThis.URL(URL);
  const socket = createConnection({ host: hostname, port: Number(port) || 6379, timeout: 500 });
  socket.once("connect", () => (socket.destroy(), resolve(true)));
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => (socket.destroy(), resolve(false)));
});

// Like the MinIO tests: runs against the compose Redis when it is up, skipped otherwise.
describe.runIf(reachable)("Redis adapters (live)", () => {
  let redis: Redis;
  const prefix = randomUUID();
  const video = {
    ...new FakePrisma().seed({ title: "t", rawBucket: "b", rawKey: "k", contentType: "video/mp4" }),
    id: randomUUID(),
  };

  beforeAll(async () => {
    redis = connectRedis(URL);
    for (let i = 0; i < 50 && !redis.isReady; i++) await new Promise((r) => setTimeout(r, 20));
  });
  afterAll(async () => {
    await redis.del([`video:${video.id}`, `views:pending:${prefix}`]);
    await redis.close();
  });

  it("stores rows with a TTL and evicts them", async () => {
    const cache = new RedisVideoCache(new RedisGuard(redis), 30);
    await cache.set(video);

    expect(await cache.get(video.id)).toEqual(video);
    const ttl = await redis.ttl(`video:${video.id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);

    await cache.evict(video.id);
    expect(await cache.get(video.id)).toBeNull();
  });

  it("dedupes a viewer, counts without a TTL, and hands each count to one taker", async () => {
    const counter = new RedisViewCounter(new RedisGuard(redis), 60);

    expect(await counter.record(prefix, "viewer-a")).toBe(true);
    expect(await counter.record(prefix, "viewer-a")).toBe(false);
    expect(await counter.record(prefix, "viewer-b")).toBe(true);
    expect(await counter.pending(prefix)).toBe(2);
    expect(await redis.ttl(`views:pending:${prefix}`)).toBe(-1);

    const [first, second] = await Promise.all([counter.take(10_000), counter.take(10_000)]);
    const mine = (first.get(prefix) ?? 0) + (second.get(prefix) ?? 0);
    expect(mine).toBe(2);
    expect(await counter.pending(prefix)).toBe(0);

    await counter.giveBack(new Map([[prefix, 2]]));
    expect(await counter.pending(prefix)).toBe(2);
    await counter.take(10_000);
  });
});
