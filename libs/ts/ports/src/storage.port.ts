// Object storage boundary: a bucket is a store, the key is the path inside it.

export interface PresignedUrlOptions {
  readonly expiresInSeconds?: number;
  // Content-Type the client must send.
  readonly contentType?: string;
}

export interface PutObjectOptions {
  readonly contentType?: string;
}

export interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType?: string;
  readonly contentLength?: number;
}

export interface UploadedPart {
  readonly partNumber: number;
  readonly size: number;
}

export interface StoragePort {
  // Client uploads straight to storage, off the app server.
  createPresignedUploadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  createPresignedDownloadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  // Transcoder fetches the raw upload.
  getObject(bucket: string, key: string): Promise<StoredObject>;

  // Transcoder stores HLS output.
  putObject(
    bucket: string,
    key: string,
    body: Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void>;

  objectExists(bucket: string, key: string): Promise<boolean>;

  deleteObject(bucket: string, key: string): Promise<void>;

  // Multipart: big files go in parts, each with its own presigned URL.
  createMultipartUpload(bucket: string, key: string, options?: PutObjectOptions): Promise<string>;

  createPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  listUploadedParts(bucket: string, key: string, uploadId: string): Promise<UploadedPart[]>;

  // Joins every stored part; the adapter reads the checksums.
  completeMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;

  // Idempotent: unknown or finished uploads succeed.
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;
}
