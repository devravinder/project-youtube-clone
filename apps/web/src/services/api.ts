import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "../api/schema";
import { getAccessToken } from "../auth/user-manager";
import { config } from "../config";
import type { PresignRequest, MultipartInitRequest } from "../types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body.message;
    if (Array.isArray(message)) {
      return message.map((item) => item.message ?? String(item)).join(", ");
    }
    return message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

const auth: Middleware = {
  async onRequest({ request }) {
    const token = await getAccessToken();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

// Shared by every API client: a non-2xx response becomes an ApiError with the server's message.
export const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) {
      throw new ApiError(response.status, await readErrorMessage(response.clone()));
    }
    return undefined;
  },
};

// Paths and payloads are checked against the generated `paths` type.
const client = createClient<paths>({
  baseUrl: config.apiBaseUrl,
  // Resolved per call so tests can stub fetch.
  fetch: (request) => globalThis.fetch(request),
});
client.use(auth, throwOnError);

// Errors already threw in the middleware.
export function bodyOf<T>(result: { data?: T }): T {
  if (result.data === undefined) {
    throw new ApiError(502, "The server returned an empty response");
  }
  return result.data;
}

export const listVideos = async (params: { cursor?: string; limit?: number } = {}) =>
  bodyOf(await client.GET("/videos", { params: { query: params } }));

export const getVideo = async (id: string) =>
  bodyOf(await client.GET("/videos/{id}", { params: { path: { id } } }));

export const recordView = async (id: string) =>
  bodyOf(await client.POST("/videos/{id}/views", { params: { path: { id } } }));

export const createPresignedUpload = async (body: PresignRequest) =>
  bodyOf(await client.POST("/uploads/presign", { body }));

export const startMultipartUpload = async (body: MultipartInitRequest) =>
  bodyOf(await client.POST("/uploads/multipart", { body }));

export const createPartUrls = async (videoId: string, partNumbers: number[]) =>
  bodyOf(
    await client.POST("/uploads/{videoId}/parts", {
      params: { path: { videoId } },
      body: { partNumbers },
    }),
  );

export const listUploadedParts = async (videoId: string) =>
  bodyOf(await client.GET("/uploads/{videoId}/parts", { params: { path: { videoId } } }));

export const confirmUpload = async (videoId: string) =>
  bodyOf(await client.POST("/uploads/{videoId}/complete", { params: { path: { videoId } } }));

export const abortUpload = async (videoId: string): Promise<void> => {
  await client.DELETE("/uploads/{videoId}", { params: { path: { videoId } } });
};

export class StorageUploadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface StorageUploadOptions {
  readonly contentType?: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (loadedBytes: number) => void;
}

// XHR, not fetch: fetch cannot report upload progress.
export function uploadToStorage(
  url: string,
  body: Blob,
  { contentType, signal, onProgress }: StorageUploadOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) {
      xhr.setRequestHeader("Content-Type", contentType);
    }
    xhr.upload.onprogress = (event) => onProgress?.(event.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new StorageUploadError(xhr.status, `Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new StorageUploadError(0, "Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    if (signal?.aborted) {
      xhr.abort();
      return;
    }
    xhr.send(body);
  });
}
