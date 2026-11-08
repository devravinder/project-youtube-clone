import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  abortUpload,
  ApiError,
  confirmUpload,
  createPartUrls,
  getVideo,
  listVideos,
  StorageUploadError,
  uploadToStorage,
} from "./api";

const getAccessToken = vi.hoisted(() => vi.fn<() => Promise<string | undefined>>());
vi.mock("../auth/user-manager", () => ({ getAccessToken }));

const fetchMock = vi.fn<(request: Request) => Promise<Response>>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const lastRequest = () => {
  const request = fetchMock.mock.calls.at(-1)?.[0];
  if (!request) throw new Error("fetch was not called");
  return request;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  getAccessToken.mockResolvedValue("token-123");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("send the bearer token when signed in", async () => {
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));

    await listVideos();

    expect(lastRequest().headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("send no Authorization header when signed out", async () => {
    getAccessToken.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(json({ items: [], nextCursor: null }));

    await listVideos();

    expect(lastRequest().headers.has("Authorization")).toBe(false);
  });

  it("build the list query from cursor and limit", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ items: [], nextCursor: null })));

    await listVideos({ cursor: "abc", limit: 12 });
    expect(lastRequest().url).toBe("http://api.test/api/videos?cursor=abc&limit=12");

    await listVideos();
    expect(lastRequest().url).toBe("http://api.test/api/videos");
  });

  it("put the id in the path", async () => {
    fetchMock.mockResolvedValue(json({ id: "vid" }));

    await getVideo("vid");

    expect(lastRequest().url).toBe("http://api.test/api/videos/vid");
    expect(lastRequest().method).toBe("GET");
  });

  it("post JSON for part URLs", async () => {
    fetchMock.mockResolvedValue(json({ urls: [], expiresInSeconds: 1 }));

    await createPartUrls("vid", [1, 2]);

    const request = lastRequest();
    expect(request.url).toBe("http://api.test/api/uploads/vid/parts");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(await request.clone().json()).toEqual({ partNumbers: [1, 2] });
  });

  it("return nothing for 204 No Content", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(abortUpload("vid")).resolves.toBeUndefined();
    expect(lastRequest().method).toBe("DELETE");
    expect(lastRequest().url).toBe("http://api.test/api/uploads/vid");
  });

  it("call the complete endpoint", async () => {
    fetchMock.mockResolvedValue(json({ videoId: "vid", status: "UPLOADED" }, 201));

    await expect(confirmUpload("vid")).resolves.toEqual({ videoId: "vid", status: "UPLOADED" });
    expect(lastRequest().url).toBe("http://api.test/api/uploads/vid/complete");
    expect(lastRequest().method).toBe("POST");
  });

  it("fail loudly when a success response has no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(getVideo("vid")).rejects.toMatchObject({ status: 502 });
  });
});
describe("errors", () => {
  it("carry the status and the server message", async () => {
    fetchMock.mockResolvedValue(json({ message: "Video not found" }, 404));

    await expect(getVideo("x")).rejects.toMatchObject({
      name: "Error",
      status: 404,
      message: "Video not found",
    });
    await expect(getVideo("x")).rejects.toBeInstanceOf(ApiError);
  });

  it("join validation messages into one line", async () => {
    fetchMock.mockResolvedValue(
      json({ message: [{ message: "Too long" }, { message: "Bad type" }] }, 400),
    );

    await expect(getVideo("x")).rejects.toThrow("Too long, Bad type");
  });

  it("fall back to the status text when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 502, statusText: "Bad Gateway" }));

    await expect(getVideo("x")).rejects.toMatchObject({ status: 502, message: "Bad Gateway" });
  });
});

class FakeXhr {
  static last: FakeXhr;
  readonly headers: Record<string, string> = {};
  readonly upload: { onprogress?: (event: { loaded: number }) => void } = {};
  method = "";
  url = "";
  status = 0;
  body: unknown;
  aborted = false;
  onload?: () => void;
  onerror?: () => void;
  onabort?: () => void;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number) {
    this.status = status;
    this.onload?.();
  }
}

describe("uploadToStorage", () => {
  beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeXhr));

  it("PUTs the body, sets the content type and reports progress", async () => {
    const blob = new Blob(["abc"]);
    const progress: number[] = [];

    const done = uploadToStorage("https://s.test/put", blob, {
      contentType: "video/mp4",
      onProgress: (loaded) => progress.push(loaded),
    });
    FakeXhr.last.upload.onprogress?.({ loaded: 2 });
    FakeXhr.last.respond(200);
    await done;

    expect(FakeXhr.last).toMatchObject({ method: "PUT", url: "https://s.test/put", body: blob });
    expect(FakeXhr.last.headers).toEqual({ "Content-Type": "video/mp4" });
    expect(progress).toEqual([2]);
  });

  it("sends no Content-Type for a part", async () => {
    const done = uploadToStorage("https://s.test/part", new Blob(["x"]));
    FakeXhr.last.respond(200);
    await done;

    expect(FakeXhr.last.headers).toEqual({});
  });

  it("rejects with the storage status on a failure response", async () => {
    const done = uploadToStorage("https://s.test/put", new Blob(["x"]));
    FakeXhr.last.respond(403);

    await expect(done).rejects.toBeInstanceOf(StorageUploadError);
    await expect(done).rejects.toMatchObject({ status: 403 });
  });

  it("rejects with status 0 on a network error", async () => {
    const done = uploadToStorage("https://s.test/put", new Blob(["x"]));
    FakeXhr.last.onerror?.();

    await expect(done).rejects.toMatchObject({ status: 0, message: "Network error during upload" });
  });

  it("aborts the request when the signal fires", async () => {
    const controller = new AbortController();
    const done = uploadToStorage("https://s.test/put", new Blob(["x"]), {
      signal: controller.signal,
    });

    controller.abort();

    await expect(done).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it("does not send anything when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadToStorage("https://s.test/put", new Blob(["x"]), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last.body).toBeUndefined();
  });
});
