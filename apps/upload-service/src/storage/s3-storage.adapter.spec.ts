import { describe, expect, it } from "vitest";
import { testConfig } from "../testing/test-data.js";
import { S3StorageAdapter } from "./s3-storage.adapter.js";

// Presigning is computed locally, so these need no storage running.
describe("S3StorageAdapter presigned URLs", () => {
  it("sign for STORAGE_ENDPOINT when no public endpoint is set", async () => {
    const storage = new S3StorageAdapter({ ...testConfig, STORAGE_ENDPOINT: "http://minio:9000" });

    const url = new URL(await storage.createPresignedUploadUrl("raw-videos", "v/source.mp4"));
    expect(url.host).toBe("minio:9000");
  });

  it("sign every kind of URL for STORAGE_PUBLIC_ENDPOINT when set", async () => {
    const storage = new S3StorageAdapter({
      ...testConfig,
      STORAGE_ENDPOINT: "http://minio:9000",
      STORAGE_PUBLIC_ENDPOINT: "http://localhost:9000",
    });

    const urls = await Promise.all([
      storage.createPresignedUploadUrl("raw-videos", "v/source.mp4", { contentType: "video/mp4" }),
      storage.createPresignedDownloadUrl("raw-videos", "v/source.mp4"),
      storage.createPresignedPartUrl("raw-videos", "v/source.mp4", "upload-1", 3),
    ]);

    for (const raw of urls) {
      const url = new URL(raw);
      expect(url.host).toBe("localhost:9000");
      expect(url.pathname).toBe("/raw-videos/v/source.mp4");
      expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(new URL(urls[2]!).searchParams.get("partNumber")).toBe("3");
  });
});
