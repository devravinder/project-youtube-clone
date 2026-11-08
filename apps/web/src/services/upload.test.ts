import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, StorageUploadError } from "./api";
import * as api from "./api";
import { cancelUpload, uploadVideo } from "./upload";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  createPresignedUpload: vi.fn(),
  startMultipartUpload: vi.fn(),
  createPartUrls: vi.fn(),
  listUploadedParts: vi.fn(),
  confirmUpload: vi.fn(),
  abortUpload: vi.fn(),
  uploadToStorage: vi.fn(),
}));

const mocked = vi.mocked(api);
const MiB = 1024 * 1024;
const PART = 5 * MiB;
// 17 MiB: three 5 MiB parts and a 2 MiB last part.
const LARGE = 17 * MiB;

const makeFile = (sizeBytes: number, name = "clip.mp4") =>
  new File([new Uint8Array(sizeBytes)], name, { type: "video/mp4", lastModified: 1 });
const resumeKey = (file: File) => `upload-resume:${file.name}:${file.size}:${file.lastModified}`;

const plan = (fileSize: number, partSize = PART) => ({
  videoId: "video-1",
  partSize,
  partCount: Math.ceil(fileSize / partSize),
});

// One URL per part number, to tell which part a PUT was.
function stubPartUrls() {
  mocked.createPartUrls.mockImplementation((_videoId, partNumbers) =>
    Promise.resolve({
      urls: partNumbers.map((n) => ({ partNumber: n, url: `https://storage.test/part-${n}` })),
      expiresInSeconds: 3600,
    }),
  );
}
const partOf = (url: string) => Number(url.split("part-")[1]);

beforeEach(() => {
  vi.resetAllMocks();
  mocked.confirmUpload.mockResolvedValue({ videoId: "video-1", status: "UPLOADED" });
  mocked.abortUpload.mockResolvedValue(undefined);
  stubPartUrls();
});

afterEach(() => vi.useRealTimers());

describe("small files", () => {
  it("use a single presigned PUT, then confirm", async () => {
    const file = makeFile(2 * MiB);
    const progress: number[] = [];
    mocked.createPresignedUpload.mockResolvedValue({
      videoId: "video-1",
      bucket: "b",
      key: "k",
      uploadUrl: "https://storage.test/put",
      expiresInSeconds: 900,
    });
    mocked.uploadToStorage.mockImplementation((_url, body, options) => {
      options?.onProgress?.(body.size / 2);
      options?.onProgress?.(body.size);
      return Promise.resolve();
    });

    const result = await uploadVideo({ file, title: "Mine", onProgress: (p) => progress.push(p) });

    expect(result).toEqual({ videoId: "video-1", title: "Mine" });
    expect(mocked.createPresignedUpload).toHaveBeenCalledWith({
      filename: "clip.mp4",
      contentType: "video/mp4",
      title: "Mine",
      description: undefined,
    });
    expect(mocked.uploadToStorage).toHaveBeenCalledWith(
      "https://storage.test/put",
      file,
      expect.objectContaining({ contentType: "video/mp4" }),
    );
    expect(progress).toEqual([50, 100]);
    expect(mocked.confirmUpload).toHaveBeenCalledWith("video-1");
    expect(mocked.startMultipartUpload).not.toHaveBeenCalled();
  });

  it("treat exactly 16 MiB as small", async () => {
    mocked.createPresignedUpload.mockResolvedValue({
      videoId: "v",
      bucket: "b",
      key: "k",
      uploadUrl: "u",
      expiresInSeconds: 1,
    });
    mocked.uploadToStorage.mockResolvedValue();

    await uploadVideo({ file: makeFile(16 * MiB), onProgress: () => undefined });

    expect(mocked.startMultipartUpload).not.toHaveBeenCalled();
  });
});

describe("large files", () => {
  it("upload every part, never more than 3 at once, then confirm", async () => {
    const file = makeFile(4 * PART);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    let running = 0;
    let peak = 0;
    const seen: { part: number; size: number }[] = [];
    mocked.uploadToStorage.mockImplementation(async (url, body) => {
      running++;
      peak = Math.max(peak, running);
      seen.push({ part: partOf(url), size: body.size });
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    const progress: number[] = [];

    const result = await uploadVideo({ file, onProgress: (p) => progress.push(p) });

    expect(result.videoId).toBe("video-1");
    expect(seen.map((s) => s.part).sort()).toEqual([1, 2, 3, 4]);
    expect(peak).toBe(3);
    expect(mocked.startMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "clip.mp4", fileSize: file.size }),
    );
    expect(mocked.createPartUrls).toHaveBeenCalledTimes(1);
    expect(progress.at(-1)).toBe(100);
    expect(mocked.confirmUpload).toHaveBeenCalledWith("video-1");
    expect(localStorage.getItem(resumeKey(file))).toBeNull();
  });

  it("sends a smaller last part", async () => {
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    const sizes = new Map<number, number>();
    mocked.uploadToStorage.mockImplementation((url, body) => {
      sizes.set(partOf(url), body.size);
      return Promise.resolve();
    });

    await uploadVideo({ file, onProgress: () => undefined });

    expect([...sizes].sort()).toEqual([
      [1, PART],
      [2, PART],
      [3, PART],
      [4, 2 * MiB],
    ]);
  });

  it("remembers the video id while uploading so it can be resumed", async () => {
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    mocked.uploadToStorage.mockImplementation(() => {
      expect(localStorage.getItem(resumeKey(file))).toBe("video-1");
      return Promise.resolve();
    });

    await uploadVideo({ file, onProgress: () => undefined });

    expect(mocked.uploadToStorage).toHaveBeenCalled();
  });
});

describe("resuming", () => {
  it("skips parts already stored with the right size and does not start a new upload", async () => {
    const file = makeFile(4 * PART);
    localStorage.setItem(resumeKey(file), "video-1");
    mocked.listUploadedParts.mockResolvedValue({
      ...plan(file.size),
      uploadedParts: [
        { partNumber: 1, size: PART },
        { partNumber: 2, size: PART },
      ],
    });
    const uploaded: number[] = [];
    mocked.uploadToStorage.mockImplementation((url) => {
      uploaded.push(partOf(url));
      return Promise.resolve();
    });
    const progress: number[] = [];

    await uploadVideo({ file, onProgress: (p) => progress.push(p) });

    expect(mocked.startMultipartUpload).not.toHaveBeenCalled();
    expect(uploaded.sort()).toEqual([3, 4]);
    expect(progress[0]).toBe(50);
    expect(progress.at(-1)).toBe(100);
  });

  it("re-uploads a stored part whose size does not match", async () => {
    const file = makeFile(LARGE);
    localStorage.setItem(resumeKey(file), "video-1");
    mocked.listUploadedParts.mockResolvedValue({
      ...plan(file.size),
      uploadedParts: [{ partNumber: 1, size: 123 }],
    });
    const uploaded: number[] = [];
    mocked.uploadToStorage.mockImplementation((url) => {
      uploaded.push(partOf(url));
      return Promise.resolve();
    });

    await uploadVideo({ file, onProgress: () => undefined });

    expect(uploaded.sort()).toEqual([1, 2, 3, 4]);
  });

  it.each([401, 403, 404, 409])(
    "starts fresh and forgets the old id when the server answers %i",
    async (status) => {
      const file = makeFile(LARGE);
      localStorage.setItem(resumeKey(file), "stale-id");
      mocked.listUploadedParts.mockRejectedValue(new ApiError(status, "gone"));
      mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
      mocked.uploadToStorage.mockResolvedValue();

      await uploadVideo({ file, onProgress: () => undefined });

      expect(mocked.startMultipartUpload).toHaveBeenCalledTimes(1);
    },
  );
});

describe("failures", () => {
  it("retries a failing part with backoff and then succeeds", async () => {
    vi.useFakeTimers();
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size, 20 * MiB));
    mocked.uploadToStorage
      .mockRejectedValueOnce(new StorageUploadError(500, "boom"))
      .mockRejectedValueOnce(new StorageUploadError(0, "network"))
      .mockResolvedValueOnce();

    const done = uploadVideo({ file, onProgress: () => undefined });
    await vi.advanceTimersByTimeAsync(1000 + 2000);
    await done;

    expect(mocked.uploadToStorage).toHaveBeenCalledTimes(3);
    expect(mocked.confirmUpload).toHaveBeenCalled();
  });

  it("asks for a fresh URL after a 403 (expired URL)", async () => {
    vi.useFakeTimers();
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size, 20 * MiB));
    mocked.uploadToStorage
      .mockRejectedValueOnce(new StorageUploadError(403, "expired"))
      .mockResolvedValueOnce();

    const done = uploadVideo({ file, onProgress: () => undefined });
    await vi.advanceTimersByTimeAsync(1000);
    await done;

    expect(mocked.createPartUrls).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts and does not start the remaining parts", async () => {
    vi.useFakeTimers();
    const file = makeFile(8 * PART);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    const started: number[] = [];
    mocked.uploadToStorage.mockImplementation((url) => {
      started.push(partOf(url));
      return Promise.reject(new StorageUploadError(500, "down"));
    });

    const done = uploadVideo({ file, onProgress: () => undefined });
    const assertion = expect(done).rejects.toThrow("down");
    await vi.runAllTimersAsync();
    await assertion;

    expect(Math.max(...started)).toBeLessThanOrEqual(3);
    expect(started).toHaveLength(9);
    expect(mocked.confirmUpload).not.toHaveBeenCalled();
    expect(localStorage.getItem(resumeKey(file))).toBe("video-1");
  });

  it("stops starting new parts once one part has failed for good", async () => {
    vi.useFakeTimers();
    const file = makeFile(8 * PART);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    const started: number[] = [];
    mocked.uploadToStorage.mockImplementation((url) => {
      const part = partOf(url);
      started.push(part);
      return part === 1
        ? Promise.reject(new StorageUploadError(500, "down"))
        : new Promise((resolve) => setTimeout(resolve, 10_000));
    });

    const done = uploadVideo({ file, onProgress: () => undefined });
    const assertion = expect(done).rejects.toThrow("down");
    await vi.runAllTimersAsync();
    await assertion;

    expect([...new Set(started)].sort()).toEqual([1, 2, 3]);
    expect(mocked.confirmUpload).not.toHaveBeenCalled();
  });
  it("does not confirm when the server cannot start the upload", async () => {
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockRejectedValue(new ApiError(401, "no token"));

    await expect(uploadVideo({ file, onProgress: () => undefined })).rejects.toMatchObject({
      status: 401,
    });
    expect(mocked.confirmUpload).not.toHaveBeenCalled();
  });
});

describe("cancelling", () => {
  it("stops without retrying when the signal is aborted", async () => {
    const file = makeFile(LARGE);
    mocked.startMultipartUpload.mockResolvedValue(plan(file.size));
    const controller = new AbortController();
    mocked.uploadToStorage.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("Upload cancelled", "AbortError"));
    });

    await expect(
      uploadVideo({ file, signal: controller.signal, onProgress: () => undefined }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mocked.uploadToStorage.mock.calls.length).toBeLessThanOrEqual(3);
    expect(mocked.confirmUpload).not.toHaveBeenCalled();
  });

  it("cancelUpload discards the remembered upload on the server", async () => {
    const file = makeFile(2 * PART);
    localStorage.setItem(resumeKey(file), "video-9");

    await cancelUpload(file);

    expect(mocked.abortUpload).toHaveBeenCalledWith("video-9");
    expect(localStorage.getItem(resumeKey(file))).toBeNull();
  });

  it("cancelUpload does nothing on the server when nothing was started", async () => {
    await cancelUpload(makeFile(PART));
    expect(mocked.abortUpload).not.toHaveBeenCalled();
  });

  it("cancelUpload ignores a server error", async () => {
    mocked.abortUpload.mockRejectedValue(new Error("offline"));
    await expect(cancelUpload(makeFile(PART), "video-1")).resolves.toBeUndefined();
  });
});
