import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import { FakePrisma } from "../testing/fake-prisma.js";
import { FakeStorage } from "../testing/fake-storage.js";
import { alice, bob, testConfig } from "../testing/test-data.js";
import { UploadsService } from "./uploads.service.js";

const MiB = 1024 * 1024;

// A 30,000,000-byte file split into 8 MiB parts: three full parts and the remainder.
const COMPLETE_SIZES = [8 * MiB, 8 * MiB, 8 * MiB, 4_834_176];

let storage: FakeStorage;
let prisma: FakePrisma;
let service: UploadsService;

beforeEach(() => {
  storage = new FakeStorage();
  prisma = new FakePrisma();
  service = new UploadsService(storage, testConfig, prisma.asPrismaService());
});

const onlyRow = () => [...prisma.rows.values()][0];
const storeParts = (uploadId: string, sizes: number[]) =>
  sizes.forEach((size, i) => storage.simulatePartPut(uploadId, i + 1, size));

describe("createPresignedUpload", () => {
  it("creates a pending video owned by the caller and returns an upload URL", async () => {
    const result = await service.createPresignedUpload(
      { filename: "My Clip.MP4", contentType: "video/mp4" },
      alice,
    );

    expect(result.uploadUrl).toContain("signature=put");
    expect(result.key).toBe(`${result.videoId}/source.mp4`);
    expect(onlyRow()).toMatchObject({
      id: result.videoId,
      title: "My Clip",
      status: "PENDING",
      ownerId: alice.id,
      rawBucket: "raw-videos",
    });
  });

  it("uses the given title instead of the filename", async () => {
    await service.createPresignedUpload(
      { filename: "a.mp4", contentType: "video/mp4", title: "Holiday" },
      alice,
    );
    expect(onlyRow().title).toBe("Holiday");
  });

  it.each([
    ["../../etc/passwd.mp4", ".mp4"],
    ["movie.mp4;rm -rf", ""],
    ["noextension", ""],
    ["clip.averyveryverylongextension", ""],
  ])("keeps only a safe extension in the key for %s", async (filename, extension) => {
    const { key, videoId } = await service.createPresignedUpload(
      { filename, contentType: "video/mp4" },
      alice,
    );
    expect(key).toBe(`${videoId}/source${extension}`);
  });
});

describe("startMultipartUpload", () => {
  it("plans 8 MiB parts and stores the plan on the video", async () => {
    const result = await service.startMultipartUpload(
      { filename: "big.mp4", contentType: "video/mp4", fileSize: 30_000_000 },
      alice,
    );

    expect(result).toMatchObject({ partSize: 8 * MiB, partCount: 4 });
    expect(onlyRow()).toMatchObject({
      status: "PENDING",
      ownerId: alice.id,
      partSize: 8 * MiB,
      partCount: 4,
      uploadId: "upload-1",
    });
  });

  it("uses one part when the file is smaller than a part", async () => {
    const result = await service.startMultipartUpload(
      { filename: "s.mp4", contentType: "video/mp4", fileSize: 5_000_000 },
      alice,
    );
    expect(result.partCount).toBe(1);
  });

  it("grows the part size so a huge file never needs more than 10,000 parts", async () => {
    const hundredGiB = 100 * 1024 ** 3;
    const { partSize, partCount } = await service.startMultipartUpload(
      { filename: "huge.mp4", contentType: "video/mp4", fileSize: hundredGiB },
      alice,
    );

    expect(partCount).toBeLessThanOrEqual(10_000);
    expect(partSize).toBeGreaterThan(8 * MiB);
    expect(partSize * partCount).toBeGreaterThanOrEqual(hundredGiB);
  });

  it("aborts the storage upload when the database insert fails", async () => {
    prisma.video.create = () => Promise.reject(new Error("db down"));

    await expect(
      service.startMultipartUpload(
        { filename: "big.mp4", contentType: "video/mp4", fileSize: 30_000_000 },
        alice,
      ),
    ).rejects.toThrow("db down");

    expect(storage.abortedUploads).toEqual(["upload-1"]);
    expect(storage.sessions.size).toBe(0);
  });
});

describe("part URLs and listing", () => {
  const start = (fileSize = 30_000_000) =>
    service.startMultipartUpload(
      { filename: "big.mp4", contentType: "video/mp4", fileSize },
      alice,
    );

  it("returns one URL per distinct requested part", async () => {
    const { videoId } = await start();
    const { urls } = await service.createPartUrls(videoId, [2, 1, 2], alice);

    expect(urls.map((u) => u.partNumber).sort()).toEqual([1, 2]);
    expect(urls[0].url).toContain("uploadId=upload-1");
  });

  it("rejects a part number beyond the plan", async () => {
    const { videoId } = await start();
    await expect(service.createPartUrls(videoId, [5], alice)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuses other users and unknown videos", async () => {
    const { videoId } = await start();
    await expect(service.createPartUrls(videoId, [1], bob)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.createPartUrls("00000000-0000-4000-8000-000000000000", [1], alice),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses part URLs for a single-PUT upload", async () => {
    const { videoId } = await service.createPresignedUpload(
      { filename: "a.mp4", contentType: "video/mp4" },
      alice,
    );
    await expect(service.createPartUrls(videoId, [1], alice)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("lists stored parts in order, with the plan, for resuming", async () => {
    const { videoId } = await start();
    storage.simulatePartPut("upload-1", 3, 8 * MiB);
    storage.simulatePartPut("upload-1", 1, 8 * MiB);

    const result = await service.listUploadedParts(videoId, alice);

    expect(result).toEqual({
      partSize: 8 * MiB,
      partCount: 4,
      uploadedParts: [
        { partNumber: 1, size: 8 * MiB },
        { partNumber: 3, size: 8 * MiB },
      ],
    });
  });
});

describe("confirmUpload (single PUT)", () => {
  const create = () =>
    service.createPresignedUpload({ filename: "a.mp4", contentType: "video/mp4" }, alice);

  it("rejects while the file is not in storage", async () => {
    const { videoId } = await create();
    await expect(service.confirmUpload(videoId, alice)).rejects.toBeInstanceOf(ConflictException);
    expect(onlyRow().status).toBe("PENDING");
  });

  it("marks the video uploaded once the file exists", async () => {
    const { videoId, bucket, key } = await create();
    storage.simulatePut(bucket, key, 100);

    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
    expect(onlyRow().status).toBe("UPLOADED");
  });

  it("is idempotent", async () => {
    const { videoId, bucket, key } = await create();
    storage.simulatePut(bucket, key, 100);
    await service.confirmUpload(videoId, alice);

    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
  });

  it("only lets the uploader confirm", async () => {
    const { videoId, bucket, key } = await create();
    storage.simulatePut(bucket, key, 100);
    await expect(service.confirmUpload(videoId, bob)).rejects.toBeInstanceOf(ForbiddenException);
    expect(onlyRow().status).toBe("PENDING");
  });

  it("returns 404 for an unknown video", async () => {
    await expect(
      service.confirmUpload("00000000-0000-4000-8000-000000000000", alice),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("confirmUpload (multipart)", () => {
  const start = () =>
    service.startMultipartUpload(
      { filename: "big.mp4", contentType: "video/mp4", fileSize: 30_000_000 },
      alice,
    );

  it("rejects while parts are missing and says how many arrived", async () => {
    const { videoId } = await start();
    storage.simulatePartPut("upload-1", 1, 8 * MiB);

    await expect(service.confirmUpload(videoId, alice)).rejects.toThrow("Uploaded 1 of 4 parts");
    expect(onlyRow().status).toBe("PENDING");
    expect(storage.sessions.has("upload-1")).toBe(true);
  });

  it("joins the parts and marks the video uploaded when all are stored", async () => {
    const { videoId } = await start();
    [1, 2, 3, 4].forEach((n) =>
      storage.simulatePartPut("upload-1", n, n === 4 ? 4_834_176 : 8 * MiB),
    );

    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
    expect(storage.objects.get(`raw-videos/${onlyRow().rawKey}`)).toBe(30_000_000);
    expect(storage.sessions.size).toBe(0);
  });

  it("recovers a retry after storage joined the parts but the database update failed", async () => {
    const { videoId } = await start();
    storeParts("upload-1", COMPLETE_SIZES);
    const originalUpdate = prisma.video.update;
    prisma.video.update = () => Promise.reject(new Error("db blip"));
    await expect(service.confirmUpload(videoId, alice)).rejects.toThrow("db blip");

    prisma.video.update = originalUpdate;
    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
  });
});

describe("confirmUpload (multipart part sizes)", () => {
  const start = (fileSize = 30_000_000) =>
    service.startMultipartUpload(
      { filename: "big.mp4", contentType: "video/mp4", fileSize },
      alice,
    );

  const rejectsWith = async (videoId: string, message: string) => {
    await expect(service.confirmUpload(videoId, alice)).rejects.toThrow(message);
    expect(onlyRow().status).toBe("PENDING");
    expect(storage.sessions.has("upload-1")).toBe(true);
  };

  it("remembers the declared file size", async () => {
    await start();
    expect(onlyRow().fileSize).toBe(30_000_000n);
  });

  it("rejects a part larger than planned", async () => {
    const { videoId } = await start();
    storeParts("upload-1", [8 * MiB, 9 * MiB, 8 * MiB, 4_834_176]);

    await rejectsWith(videoId, `Part 2 has ${9 * MiB} bytes, expected ${8 * MiB}`);
  });

  it("rejects a short part in the middle", async () => {
    const { videoId } = await start();
    storeParts("upload-1", [8 * MiB, 8 * MiB, 5 * MiB, 4_834_176]);

    await rejectsWith(videoId, `Part 3 has ${5 * MiB} bytes, expected ${8 * MiB}`);
  });

  it.each([
    ["too big", 4_834_177],
    ["too small", 4_834_175],
  ])(
    "rejects a last part that is %s, so the total differs from the declared size",
    async (_n, last) => {
      const { videoId } = await start();
      storeParts("upload-1", [8 * MiB, 8 * MiB, 8 * MiB, last]);

      await rejectsWith(videoId, `Part 4 has ${last} bytes, expected 4834176`);
    },
  );

  it("rejects a part number outside the plan", async () => {
    const { videoId } = await start();
    storeParts("upload-1", [8 * MiB, 8 * MiB, 8 * MiB]);
    storage.simulatePartPut("upload-1", 5, 1000);

    await rejectsWith(videoId, "Unexpected part 5");
  });

  it("accepts exactly the planned sizes", async () => {
    const { videoId } = await start();
    storeParts("upload-1", COMPLETE_SIZES);

    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
  });

  it("accepts a one-part file smaller than a part, and rejects a wrong size for it", async () => {
    const { videoId } = await start(1_000_000);
    storeParts("upload-1", [999_999]);
    await rejectsWith(videoId, "Part 1 has 999999 bytes, expected 1000000");

    storeParts("upload-1", [1_000_000]);
    expect(await service.confirmUpload(videoId, alice)).toEqual({ videoId, status: "UPLOADED" });
  });

  it("skips the size check for an upload started before sizes were stored", async () => {
    const uploadId = await storage.createMultipartUpload("raw-videos", "old/source.mp4");
    const old = prisma.seed({
      title: "legacy",
      rawBucket: "raw-videos",
      rawKey: "old/source.mp4",
      contentType: "video/mp4",
      ownerId: alice.id,
      uploadId,
      partSize: 8 * MiB,
      partCount: 2,
      fileSize: null,
    });
    storeParts(uploadId, [123, 456]);

    expect(await service.confirmUpload(old.id, alice)).toEqual({
      videoId: old.id,
      status: "UPLOADED",
    });
  });
});
describe("abortUpload", () => {
  it("aborts the storage upload and removes the video", async () => {
    const { videoId } = await service.startMultipartUpload(
      { filename: "big.mp4", contentType: "video/mp4", fileSize: 30_000_000 },
      alice,
    );
    storage.simulatePartPut("upload-1", 1, 8 * MiB);

    await service.abortUpload(videoId, alice);

    expect(storage.abortedUploads).toEqual(["upload-1"]);
    expect(prisma.rows.size).toBe(0);
  });

  it("refuses to abort a finished upload or someone else's upload", async () => {
    const { videoId, bucket, key } = await service.createPresignedUpload(
      { filename: "a.mp4", contentType: "video/mp4" },
      alice,
    );
    await expect(service.abortUpload(videoId, bob)).rejects.toBeInstanceOf(ForbiddenException);

    storage.simulatePut(bucket, key, 1);
    await service.confirmUpload(videoId, alice);
    await expect(service.abortUpload(videoId, alice)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.rows.size).toBe(1);
  });
});
