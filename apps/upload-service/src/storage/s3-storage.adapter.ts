import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PresignedUrlOptions, PutObjectOptions, StoragePort, StoredObject } from "@yt/ports";
import type { AppConfig } from "../config/app.config.js";

const DEFAULT_EXPIRY_SECONDS = 900;

// Serves MinIO locally and AWS S3 in the cloud; only config differs.
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;

  constructor(config: AppConfig) {
    this.client = new S3Client({
      endpoint: config.STORAGE_ENDPOINT,
      region: config.STORAGE_REGION,
      forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
      // Default checksums get baked into presigned PUT URLs and break real S3 uploads.
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.STORAGE_ACCESS_KEY,
        secretAccessKey: config.STORAGE_SECRET_KEY,
      },
    });
  }

  createPresignedUploadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options?.contentType,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS,
    });
  }

  createPresignedDownloadUrl(
    bucket: string,
    key: string,
    options?: PresignedUrlOptions,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS,
    });
  }

  async getObject(bucket: string, key: string): Promise<StoredObject> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) {
      throw new Error(`Object has no body: ${bucket}/${key}`);
    }
    return {
      body: await response.Body.transformToByteArray(),
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  }

  async putObject(
    bucket: string,
    key: string,
    body: Uint8Array,
    options?: PutObjectOptions,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: options?.contentType,
      }),
    );
  }

  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
