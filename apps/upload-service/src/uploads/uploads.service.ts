import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { StoragePort } from "@yt/ports";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import type { PresignRequest, PresignResponse } from "./presign.dto.js";

const UPLOAD_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async createPresignedUpload(request: PresignRequest): Promise<PresignResponse> {
    const videoId = randomUUID();
    const bucket = this.config.STORAGE_RAW_BUCKET;
    const key = `${videoId}/source${safeExtension(request.filename)}`;

    const uploadUrl = await this.storage.createPresignedUploadUrl(bucket, key, {
      contentType: request.contentType,
      expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS,
    });

    return { videoId, bucket, key, uploadUrl, expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS };
  }
}

// Client filenames are untrusted; keep only a short alphanumeric extension.
function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}
