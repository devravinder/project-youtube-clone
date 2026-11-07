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
}
