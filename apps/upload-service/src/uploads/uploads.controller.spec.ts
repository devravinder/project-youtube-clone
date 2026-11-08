import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/test-app.js";

const MiB = 1024 * 1024;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.app.close());
beforeEach(() => {
  t.prisma.reset();
  t.storage.reset();
});

describe("authentication", () => {
  it.each([
    ["post", "/uploads/presign"],
    ["post", "/uploads/multipart"],
    ["post", `/uploads/${UNKNOWN_ID}/parts`],
    ["get", `/uploads/${UNKNOWN_ID}/parts`],
    ["post", `/uploads/${UNKNOWN_ID}/complete`],
    ["delete", `/uploads/${UNKNOWN_ID}`],
  ] as const)("%s %s needs a token", async (method, url) => {
    const response = await t.http()[method](url);
    expect(response.status).toBe(401);
  });
});

describe("POST /uploads/presign", () => {
  it("creates a pending video and returns an upload URL", async () => {
    const response = await t
      .as("alice")
      .post("/uploads/presign")
      .send({ filename: "clip.mp4", contentType: "video/mp4", title: "First" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      key: expect.stringMatching(/^[0-9a-f-]{36}\/source\.mp4$/),
      bucket: "raw-videos",
      expiresInSeconds: 900,
    });
    expect(response.body.uploadUrl).toContain("signature=put");
  });

  it.each([
    ["a non-video content type", { filename: "n.txt", contentType: "text/plain" }],
    ["a missing filename", { contentType: "video/mp4" }],
    ["a missing content type", { filename: "a.mp4" }],
    [
      "a title over 200 characters",
      { filename: "a.mp4", contentType: "video/mp4", title: "x".repeat(201) },
    ],
    ["an empty body", {}],
  ])("rejects %s", async (_name, body) => {
    const response = await t.as("alice").post("/uploads/presign").send(body);
    expect(response.status).toBe(400);
  });
});

describe("single-PUT flow", () => {
  it("is hidden until confirmed, then listed and playable", async () => {
    const presign = await t
      .as("alice")
      .post("/uploads/presign")
      .send({ filename: "clip.mp4", contentType: "video/mp4", title: "Flow" });
    const { videoId, bucket, key } = presign.body;

    expect((await t.http().get("/videos")).body.items).toHaveLength(0);
    expect((await t.as("alice").post(`/uploads/${videoId}/complete`)).status).toBe(409);

    t.storage.simulatePut(bucket, key, 1234);
    const confirm = await t.as("alice").post(`/uploads/${videoId}/complete`);
    expect(confirm.status).toBe(201);
    expect(confirm.body).toEqual({ videoId, status: "UPLOADED" });

    const list = await t.http().get("/videos");
    expect(list.body.items.map((v: { id: string }) => v.id)).toEqual([videoId]);

    const detail = await t.http().get(`/videos/${videoId}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ title: "Flow", status: "UPLOADED", viewCount: 0 });
    expect(detail.body.playbackUrl).toContain("signature=get");
  });

  it("returns 403 to another user and 404 for an unknown video", async () => {
    const { videoId } = (
      await t
        .as("alice")
        .post("/uploads/presign")
        .send({ filename: "a.mp4", contentType: "video/mp4" })
    ).body;

    expect((await t.as("bob").post(`/uploads/${videoId}/complete`)).status).toBe(403);
    expect((await t.as("alice").post(`/uploads/${UNKNOWN_ID}/complete`)).status).toBe(404);
    expect((await t.as("alice").post("/uploads/not-a-uuid/complete")).status).toBe(400);
  });

  it("confirms without touching the broker and leaves one command in the outbox", async () => {
    const { videoId, bucket, key } = (
      await t
        .as("alice")
        .post("/uploads/presign")
        .send({ filename: "a.mp4", contentType: "video/mp4" })
    ).body;
    t.storage.simulatePut(bucket, key, 10);

    expect((await t.as("alice").post(`/uploads/${videoId}/complete`)).status).toBe(201);
    expect((await t.as("alice").post(`/uploads/${videoId}/complete`)).status).toBe(201);

    const rows = [...t.prisma.outbox.values()];
    expect(rows.map((r) => (r.payload as { videoId: string }).videoId)).toEqual([videoId]);
  });
});

describe("multipart flow", () => {
  const start = (fileSize = 30_000_000) =>
    t.as("alice").post("/uploads/multipart").send({
      filename: "big.mp4",
      contentType: "video/mp4",
      fileSize,
      title: "Big one",
    });

  it("plans the parts", async () => {
    const response = await start();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ partSize: 8 * MiB, partCount: 4 });
  });

  it.each([
    ["a zero file size", { fileSize: 0 }],
    ["a negative file size", { fileSize: -5 }],
    ["a fractional file size", { fileSize: 1.5 }],
    ["a missing file size", {}],
    ["a non-video type", { fileSize: 10, contentType: "text/plain" }],
  ])("rejects %s", async (_name, overrides) => {
    const response = await t
      .as("alice")
      .post("/uploads/multipart")
      .send({ filename: "big.mp4", contentType: "video/mp4", ...overrides });
    expect(response.status).toBe(400);
  });

  it("uploads, resumes, completes and plays", async () => {
    const { videoId } = (await start()).body;

    const urls = await t
      .as("alice")
      .post(`/uploads/${videoId}/parts`)
      .send({ partNumbers: [1, 2, 3, 4] });
    expect(urls.status).toBe(201);
    expect(urls.body.urls).toHaveLength(4);

    expect((await t.as("alice").post(`/uploads/${videoId}/complete`)).status).toBe(409);

    t.storage.simulatePartPut("upload-1", 1, 8 * MiB);
    t.storage.simulatePartPut("upload-1", 2, 8 * MiB);
    const resumed = await t.as("alice").get(`/uploads/${videoId}/parts`);
    expect(resumed.body.uploadedParts.map((p: { partNumber: number }) => p.partNumber)).toEqual([
      1, 2,
    ]);

    const incomplete = await t.as("alice").post(`/uploads/${videoId}/complete`);
    expect(incomplete.status).toBe(409);
    expect(incomplete.body.message).toBe("Uploaded 2 of 4 parts");

    t.storage.simulatePartPut("upload-1", 3, 8 * MiB);
    t.storage.simulatePartPut("upload-1", 4, 4_834_176);
    const done = await t.as("alice").post(`/uploads/${videoId}/complete`);
    expect(done.body.status).toBe("UPLOADED");
    expect(t.prisma.outbox.size).toBe(1);

    expect((await t.http().get(`/videos/${videoId}`)).body.playbackUrl).toBeTypeOf("string");
    expect(
      (
        await t
          .as("alice")
          .post(`/uploads/${videoId}/parts`)
          .send({ partNumbers: [1] })
      ).status,
    ).toBe(409);
  });

  it("refuses to complete when a part is bigger than the plan", async () => {
    const { videoId } = (await start()).body;
    t.storage.simulatePartPut("upload-1", 1, 8 * MiB);
    t.storage.simulatePartPut("upload-1", 2, 20 * MiB);
    t.storage.simulatePartPut("upload-1", 3, 8 * MiB);
    t.storage.simulatePartPut("upload-1", 4, 4_834_176);

    const response = await t.as("alice").post(`/uploads/${videoId}/complete`);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(`Part 2 has ${20 * MiB} bytes, expected ${8 * MiB}`);
    expect((await t.http().get(`/videos/${videoId}`)).body.status).toBe("PENDING");
  });
  it("validates the part request", async () => {
    const { videoId } = (await start()).body;
    const ask = (body: unknown) =>
      t
        .as("alice")
        .post(`/uploads/${videoId}/parts`)
        .send(body as object);

    expect((await ask({ partNumbers: [5] })).status).toBe(400);
    expect((await ask({ partNumbers: [] })).status).toBe(400);
    expect((await ask({ partNumbers: [0] })).status).toBe(400);
    expect((await ask({ partNumbers: [1.5] })).status).toBe(400);
    expect((await ask({})).status).toBe(400);
    expect((await ask({ partNumbers: Array.from({ length: 101 }, (_, i) => i + 1) })).status).toBe(
      400,
    );
  });

  it("keeps other users out", async () => {
    const { videoId } = (await start()).body;
    expect(
      (
        await t
          .as("bob")
          .post(`/uploads/${videoId}/parts`)
          .send({ partNumbers: [1] })
      ).status,
    ).toBe(403);
    expect((await t.as("bob").get(`/uploads/${videoId}/parts`)).status).toBe(403);
    expect((await t.as("bob").delete(`/uploads/${videoId}`)).status).toBe(403);
  });

  it("aborts and forgets an unfinished upload", async () => {
    const { videoId } = (await start()).body;

    const response = await t.as("alice").delete(`/uploads/${videoId}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
    expect(t.storage.abortedUploads).toEqual(["upload-1"]);
    expect((await t.http().get(`/videos/${videoId}`)).status).toBe(404);
  });
});

describe("GET /videos", () => {
  const seedUploaded = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await t.prisma.video.create({
        data: {
          title: `v${i}`,
          rawBucket: "raw-videos",
          rawKey: `k${i}.mp4`,
          contentType: "video/mp4",
          status: "UPLOADED",
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
      });
    }
  };

  it("pages newest first and ends with a null cursor", async () => {
    await seedUploaded(5);

    const first = await t.http().get("/videos?limit=2");
    expect(first.body.items.map((v: { title: string }) => v.title)).toEqual(["v4", "v3"]);
    expect(first.body.nextCursor).toBeTypeOf("string");

    const second = await t.http().get(`/videos?limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items.map((v: { title: string }) => v.title)).toEqual(["v2", "v1"]);

    const last = await t.http().get(`/videos?limit=2&cursor=${second.body.nextCursor}`);
    expect(last.body.items.map((v: { title: string }) => v.title)).toEqual(["v0"]);
    expect(last.body.nextCursor).toBeNull();
  });

  it("defaults to 12 items", async () => {
    await seedUploaded(15);
    expect((await t.http().get("/videos")).body.items).toHaveLength(12);
  });

  it.each(["limit=0", "limit=51", "limit=abc", "cursor=not-a-uuid"])(
    "rejects %s",
    async (query) => {
      expect((await t.http().get(`/videos?${query}`)).status).toBe(400);
    },
  );
});

describe("GET /videos/:id", () => {
  it("returns 404 for an unknown id and 400 for a malformed one", async () => {
    expect((await t.http().get(`/videos/${UNKNOWN_ID}`)).status).toBe(404);
    expect((await t.http().get("/videos/not-a-uuid")).status).toBe(400);
  });

  it("has no playback URL while the file is missing", async () => {
    const { videoId } = (
      await t
        .as("alice")
        .post("/uploads/presign")
        .send({ filename: "a.mp4", contentType: "video/mp4" })
    ).body;

    const detail = await t.http().get(`/videos/${videoId}`);
    expect(detail.body.playbackUrl).toBeNull();
    expect(detail.body.status).toBe("PENDING");
    expect(detail.body.renditions).toEqual([]);
  });

  it("serves the public HLS master playlist and variants, highest first, once READY", async () => {
    const video = t.prisma.seed({
      title: "done",
      rawBucket: "raw-videos",
      rawKey: "v/source.mp4",
      contentType: "video/mp4",
      status: "READY",
      hlsMasterKey: "v/hls/master.m3u8",
      renditions: [
        { name: "360p", key: "v/hls/360p/index.m3u8" },
        { name: "720p", key: "v/hls/720p/index.m3u8" },
        { name: "bogus", key: "v/x.mp4" },
      ],
    });

    const detail = (await t.http().get(`/videos/${video.id}`)).body;

    expect(
      detail.renditions.map((r: { name: string; height: number }) => [r.name, r.height]),
    ).toEqual([
      ["720p", 720],
      ["360p", 360],
    ]);
    expect(detail.renditions[0].playbackUrl).toBe(
      "https://cdn.test/hls-videos/v/hls/720p/index.m3u8",
    );
    expect(detail.playbackUrl).toBe("https://cdn.test/hls-videos/v/hls/master.m3u8");
    expect(detail.failureReason).toBeNull();
  });

  it("explains a failure and still plays the original", async () => {
    const video = t.prisma.seed({
      title: "broken",
      rawBucket: "raw-videos",
      rawKey: "b/source.mp4",
      contentType: "video/mp4",
      status: "FAILED",
      failureReason: "ffprobe exited with 1",
    });
    t.storage.simulatePut("raw-videos", "b/source.mp4", 10);

    const detail = (await t.http().get(`/videos/${video.id}`)).body;

    expect(detail).toMatchObject({
      status: "FAILED",
      failureReason: "ffprobe exited with 1",
      renditions: [],
    });
    expect(detail.playbackUrl).toContain("raw-videos/b/source.mp4");
  });
});
