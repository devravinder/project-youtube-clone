import { beforeEach, describe, expect, it } from "vitest";
import { FakeVideoCache } from "../testing/fake-cache.js";
import { FakePrisma } from "../testing/fake-prisma.js";
import { FakeStorage } from "../testing/fake-storage.js";
import { testConfig } from "../testing/test-data.js";
import { CleanupService } from "./cleanup.service.js";

const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

let storage: FakeStorage;
let prisma: FakePrisma;
let cache: FakeVideoCache;
let cleanup: CleanupService;

beforeEach(() => {
  storage = new FakeStorage();
  prisma = new FakePrisma();
  cache = new FakeVideoCache();
  cleanup = new CleanupService(storage, testConfig, prisma.asPrismaService(), cache);
});

const seed = (overrides: Record<string, unknown> = {}) =>
  prisma.seed({
    title: "t",
    rawBucket: "raw-videos",
    rawKey: `k/${crypto.randomUUID()}.mp4`,
    contentType: "video/mp4",
    createdAt: daysAgo(3),
    ...overrides,
  });

describe("removeAbandonedUploads", () => {
  it("removes expired pending uploads and their files", async () => {
    const old = seed();
    storage.simulatePut(old.rawBucket, old.rawKey, 10);

    expect(await cleanup.removeAbandonedUploads()).toBe(1);

    expect(prisma.rows.size).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it("keeps recent pending uploads and finished videos", async () => {
    seed({ createdAt: new Date() });
    seed({ status: "UPLOADED" });
    seed({ status: "READY" });

    expect(await cleanup.removeAbandonedUploads()).toBe(0);
    expect(prisma.rows.size).toBe(3);
  });

  it("drains more than one batch in a single run", async () => {
    for (let i = 0; i < 250; i++) seed();

    expect(await cleanup.removeAbandonedUploads()).toBe(250);
    expect(prisma.rows.size).toBe(0);
  });

  it("aborts the multipart upload of an abandoned video", async () => {
    const uploadId = await storage.createMultipartUpload("raw-videos", "k/big.mp4");
    storage.simulatePartPut(uploadId, 1, 8 * 1024 * 1024);
    seed({ rawKey: "k/big.mp4", uploadId, partSize: 8 * 1024 * 1024, partCount: 4 });

    await cleanup.removeAbandonedUploads();

    expect(storage.abortedUploads).toEqual([uploadId]);
    expect(storage.sessions.size).toBe(0);
    expect(prisma.rows.size).toBe(0);
  });

  it("skips a video that fails and still cleans the others, without looping forever", async () => {
    const broken = seed();
    seed();
    seed();
    const realDelete = storage.deleteObject.bind(storage);
    storage.deleteObject = (bucket, key) =>
      key === broken.rawKey ? Promise.reject(new Error("storage down")) : realDelete(bucket, key);

    expect(await cleanup.removeAbandonedUploads()).toBe(2);

    expect([...prisma.rows.keys()]).toEqual([broken.id]);
  });

  it("ignores a second run that starts while one is still going", async () => {
    for (let i = 0; i < 5; i++) seed();

    const [first, second] = await Promise.all([
      cleanup.removeAbandonedUploads(),
      cleanup.removeAbandonedUploads(),
    ]);

    expect([first, second].sort()).toEqual([0, 5]);
  });
});
