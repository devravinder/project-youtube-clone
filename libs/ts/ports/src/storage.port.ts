/**
 * StoragePort — the hexagonal boundary for object storage.
 *
 * Adapters implement this: `MinioStorageAdapter` (local) and `S3StorageAdapter` (aws).
 * Application/domain code depends only on this interface, so swapping MinIO ↔ S3 is a
 * module binding + config change, never a rewrite. See ADR-001 and the `nestjs-microservice`
 * skill.
 *
 * A "bucket" is a logical store (e.g. raw-videos, hls-videos); a "key" is the object path
 * within it (e.g. `<videoId>/source.mp4`).
 */

export interface PresignedUrlOptions {
  /** Seconds until the presigned URL expires. */
  readonly expiresInSeconds?: number;
  /** Required Content-Type the client must send on upload (PUT). */
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
  /**
   * Create a time-limited URL the client uses to upload bytes directly to storage (HTTP
   * PUT), keeping large uploads off the app server.
   */
  createPresignedUploadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  /**
   * Create a time-limited URL to read/download an object directly from storage.
   */
  createPresignedDownloadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string>;

  /** Read an object's bytes (used by the transcoder to fetch the raw upload). */
  getObject(bucket: string, key: string): Promise<StoredObject>;

  /** Write an object's bytes (used by the transcoder to store HLS segments). */
  putObject(
    bucket: string,
    key: string,
    body: Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void>;

  /** Whether an object exists (e.g. confirm an upload completed). */
  objectExists(bucket: string, key: string): Promise<boolean>;

  /** Remove an object. */
  deleteObject(bucket: string, key: string): Promise<void>;
}
