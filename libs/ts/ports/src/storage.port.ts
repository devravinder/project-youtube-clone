// Object storage boundary; MinIO and S3 adapters implement it.
// Bucket is a logical store; key is the object path within it.

export interface PresignedUrlOptions {
  readonly expiresInSeconds?: number;
  // Content-Type the client must send on upload.
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
  // Client uploads directly to storage, keeping bytes off the app server.
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

  // Transcoder fetches the raw upload with this.
  getObject(bucket: string, key: string): Promise<StoredObject>;

  // Transcoder stores HLS output with this.
  putObject(
    bucket: string,
    key: string,
    body: Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void>;

  objectExists(bucket: string, key: string): Promise<boolean>;

  deleteObject(bucket: string, key: string): Promise<void>;

  // Multipart upload: the client sends big files in parts, each with its own presigned URL.
  // Parts can be retried or resumed independently; storage joins them on complete.
  createMultipartUpload(bucket: string, key: string, options?: PutObjectOptions): Promise<string>;

  createPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  listUploadedParts(bucket: string, key: string, uploadId: string): Promise<UploadedPart[]>;

  // Joins every uploaded part; the adapter reads the part checksums itself.
  completeMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;

  // Idempotent: aborting an unknown or finished upload succeeds.
  abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void>;
}
