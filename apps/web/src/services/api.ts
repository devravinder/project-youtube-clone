import { getAccessToken } from "../auth/user-manager";
import { config } from "../config";
import type {
  ConfirmUploadResponse,
  PresignRequest,
  PresignResponse,
  VideoDetail,
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

// XHR, not fetch: fetch cannot report upload progress.
export function uploadToStorage(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
