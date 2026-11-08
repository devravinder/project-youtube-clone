import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedUrlOptions,
  PutObjectOptions,
  StoragePort,
  StoredObject,
  UploadedPart,
} from "@yt/ports";
import type { AppConfig } from "../config/app.config.js";

const DEFAULT_EXPIRY_SECONDS = 900;

// Serves MinIO and S3; only config differs.
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;

  constructor(config: AppConfig) {
    this.client = new S3Client({
      endpoint: config.STORAGE_ENDPOINT,
      region: config.STORAGE_REGION,
      forcePathStyle: config.STORAGE_FORCE_PATH_STYLE,
      // Default checksums break presigned PUTs on real S3.
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

  async createMultipartUpload(
    bucket: string,
    key: string,
    options?: PutObjectOptions,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        ContentType: options?.contentType,
      }),
    );
    if (!response.UploadId) {
      throw new Error(`Storage returned no upload id for ${bucket}/${key}`);
    }
    return response.UploadId;
  }

  createPresignedPartUrl(
    bucket: string,
    key: string,
    uploadId: string,
    partNumber: number,
    options?: PresignedUrlOptions,
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: options?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS,
    });
  }

  async listUploadedParts(bucket: string, key: string, uploadId: string): Promise<UploadedPart[]> {
    return (await this.listAllParts(bucket, key, uploadId)).map(({ partNumber, size }) => ({
      partNumber,
      size,
    }));
  }

  async completeMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    const parts = await this.listAllParts(bucket, key, uploadId);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map(({ partNumber, etag }) => ({ PartNumber: partNumber, ETag: etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(bucket: string, key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== "NoSuchUpload") {
        throw error;
      }
    }
  }

  // ListParts returns at most 1000 parts per call.
  private async listAllParts(bucket: string, key: string, uploadId: string) {
    const parts: { partNumber: number; size: number; etag: string }[] = [];
    let marker: string | undefined;
    do {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        parts.push({
          partNumber: part.PartNumber ?? 0,
          size: part.Size ?? 0,
          etag: part.ETag ?? "",
        });
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
