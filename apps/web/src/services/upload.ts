import {
  abortUpload,
  ApiError,
  confirmUpload,
  createPartUrls,
  createPresignedUpload,
  listUploadedParts,
  startMultipartUpload,
  StorageUploadError,
  uploadToStorage,
} from "./api";

export const MULTIPART_THRESHOLD_BYTES = 16 * 1024 * 1024;
const PARALLEL_PARTS = 3;
const URL_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1000;
const RESUME_KEY_PREFIX = "upload-resume:";

export interface UploadInput {
  readonly file: File;
  readonly title?: string;
  readonly description?: string;
  readonly signal?: AbortSignal;
  readonly onProgress: (percent: number) => void;
}

export interface UploadResult {
  readonly videoId: string;
  readonly title: string;
}

export async function uploadVideo(input: UploadInput): Promise<UploadResult> {
  const { file, title, description, signal, onProgress } = input;
  const result = { title: title ?? file.name };

  if (file.size <= MULTIPART_THRESHOLD_BYTES) {
    const presign = await createPresignedUpload({
      filename: file.name,
      contentType: file.type,
      title,
      description,
    });
    await uploadToStorage(presign.uploadUrl, file, {
      contentType: file.type,
      signal,
      onProgress: (loaded) => onProgress(toPercent(loaded, file.size)),
    });
    await confirmUpload(presign.videoId);
    return { ...result, videoId: presign.videoId };
  }

  const videoId = await uploadInParts(input);
  await confirmUpload(videoId);
  localStorage.removeItem(resumeKey(file));
  return { ...result, videoId };
}

// Discards an unfinished upload on the server and forgets how to resume it.
export async function cancelUpload(file: File, videoId?: string): Promise<void> {
  const id = videoId ?? localStorage.getItem(resumeKey(file));
  localStorage.removeItem(resumeKey(file));
  if (id) {
    await abortUpload(id).catch(() => undefined);
  }
}

async function uploadInParts({
  file,
  title,
  description,
  signal,
  onProgress,
}: UploadInput): Promise<string> {
  const session = (await tryResume(file)) ?? {
    ...(await startMultipartUpload({
      filename: file.name,
      contentType: file.type,
      fileSize: file.size,
      title,
      description,
    })),
    uploadedParts: [],
  };
  const { videoId, partSize, partCount, uploadedParts } = session;
  localStorage.setItem(resumeKey(file), videoId);
  const sizeOf = (partNumber: number) =>
    Math.min(partSize, file.size - (partNumber - 1) * partSize);

  const done = new Set(
    uploadedParts
      .filter((part) => part.size === sizeOf(part.partNumber))
      .map((part) => part.partNumber),
  );
  const pending = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));

  let finishedBytes = [...done].reduce((sum, n) => sum + sizeOf(n), 0);
  const inFlight = new Map<number, number>();
  const report = () => {
    const live = [...inFlight.values()].reduce((sum, bytes) => sum + bytes, 0);
    onProgress(toPercent(finishedBytes + live, file.size));
  };
  report();

  const urls = new Map<number, string>();
  // Fetches URLs for this part and the next ones still missing, one request per batch.
  const loadUrlsFrom = async (partNumber: number) => {
    const wanted = pending.filter((n) => n >= partNumber && !urls.has(n)).slice(0, URL_BATCH_SIZE);
    const batch = await createPartUrls(videoId, wanted);
    batch.urls.forEach(({ partNumber: n, url }) => urls.set(n, url));
  };

  // Workers that need a URL at the same moment share one request.
  let loading: Promise<void> | null = null;
  const ensureUrl = async (partNumber: number) => {
    while (!urls.has(partNumber)) {
      loading ??= loadUrlsFrom(partNumber).finally(() => {
        loading = null;
      });
      await loading;
    }
  };
  const uploadPart = async (partNumber: number) => {
    const start = (partNumber - 1) * partSize;
    const blob = file.slice(start, start + sizeOf(partNumber));

    for (let attempt = 1; ; attempt++) {
      signal?.throwIfAborted();
      try {
        await ensureUrl(partNumber);
        await uploadToStorage(urls.get(partNumber) ?? "", blob, {
          signal,
          onProgress: (loaded) => {
            inFlight.set(partNumber, loaded);
            report();
          },
        });
        inFlight.delete(partNumber);
        finishedBytes += blob.size;
        report();
        return;
      } catch (error) {
        inFlight.delete(partNumber);
        if (isAbort(error) || attempt >= MAX_ATTEMPTS) {
          throw error;
        }
        // An expired or rejected URL is replaced on the next attempt.
        if (error instanceof StorageUploadError && error.status === 403) {
          urls.delete(partNumber);
        }
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), signal);
      }
    }
  };

  await runPool(pending, PARALLEL_PARTS, uploadPart);
  return videoId;
}

// Asks the server what a previous attempt already stored; any failure means "start fresh".
async function tryResume(file: File) {
  const videoId = localStorage.getItem(resumeKey(file));
  if (!videoId) {
    return null;
  }
  try {
    return { videoId, ...(await listUploadedParts(videoId)) };
  } catch (error) {
    if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
      localStorage.removeItem(resumeKey(file));
    }
    return null;
  }
}

async function runPool<T>(items: T[], size: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      try {
        await task(item);
      } catch (error) {
        // Stop handing out work; the remaining parts stay uploadable on a retry.
        queue.length = 0;
        throw error;
      }
    }
  });
  await Promise.all(workers);
}

const resumeKey = (file: File) =>
  `${RESUME_KEY_PREFIX}${file.name}:${file.size}:${file.lastModified}`;

const toPercent = (loaded: number, total: number) =>
  Math.min(100, Math.round((loaded / total) * 100));

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Upload cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}
