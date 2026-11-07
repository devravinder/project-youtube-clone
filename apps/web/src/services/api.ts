import { getAccessToken } from "../auth/user-manager";
import { config } from "../config";
import type {
  ConfirmUploadResponse,
  MultipartInitRequest,
  MultipartInitResponse,
  PartUrlsResponse,
  PresignRequest,
  PresignResponse,
  VideoDetail,
  UploadedPartsResponse,
  VideoPage,
} from "../types";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const listVideos = (params: { cursor?: string; limit?: number } = {}) => {
  const query = new URLSearchParams();
  if (params.cursor) {
    query.set("cursor", params.cursor);
  }
  if (params.limit) {
    query.set("limit", String(params.limit));
  }
  const queryString = query.toString();
  return request<VideoPage>(`/videos${queryString ? `?${queryString}` : ""}`);
};

export const getVideo = (id: string) => request<VideoDetail>(`/videos/${id}`);

export const createPresignedUpload = (body: PresignRequest) =>
  request<PresignResponse>("/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const confirmUpload = (videoId: string) =>
  request<ConfirmUploadResponse>(`/uploads/${videoId}/complete`, {
    method: "POST",
  });

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const startMultipartUpload = (body: MultipartInitRequest) =>
  request<MultipartInitResponse>("/uploads/multipart", jsonPost(body));

export const createPartUrls = (videoId: string, partNumbers: number[]) =>
  request<PartUrlsResponse>(`/uploads/${videoId}/parts`, jsonPost({ partNumbers }));

export const listUploadedParts = (videoId: string) =>
  request<UploadedPartsResponse>(`/uploads/${videoId}/parts`);

export const abortUpload = (videoId: string) =>
  request<void>(`/uploads/${videoId}`, { method: "DELETE" });

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
