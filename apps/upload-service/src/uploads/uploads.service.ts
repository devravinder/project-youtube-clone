import { randomUUID } from "node:crypto";
import { extname, parse } from "node:path";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { StoragePort } from "@yt/ports";
import type { AuthUser } from "../auth/auth-user.js";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import type { ConfirmUploadResponse, PresignRequest, PresignResponse } from "./presign.dto.js";

const UPLOAD_URL_EXPIRY_SECONDS = 900;

@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async createPresignedUpload(request: PresignRequest, user: AuthUser): Promise<PresignResponse> {
    const videoId = randomUUID();
    const bucket = this.config.STORAGE_RAW_BUCKET;
    const key = `${videoId}/source${safeExtension(request.filename)}`;

    const uploadUrl = await this.storage.createPresignedUploadUrl(bucket, key, {
      contentType: request.contentType,
      expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS,
    });

    // Insert last: if it fails, the client never receives a usable URL.
    await this.prisma.video.create({
      data: {
        id: videoId,
        title: request.title ?? parse(request.filename).name,
        description: request.description,
        rawBucket: bucket,
        rawKey: key,
        contentType: request.contentType,
        ownerId: user.id,
      },
    });

    return { videoId, bucket, key, uploadUrl, expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS };
  }

  async confirmUpload(videoId: string, user: AuthUser): Promise<ConfirmUploadResponse> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }
    if (video.ownerId !== user.id) {
      throw new ForbiddenException("Only the uploader can confirm this video");
    }
    if (video.status !== VideoStatus.PENDING) {
      return { videoId, status: video.status };
    }

    const exists = await this.storage.objectExists(video.rawBucket, video.rawKey);
    if (!exists) {
      throw new ConflictException("File has not been uploaded to storage yet");
    }

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.UPLOADED },
    });
    return { videoId, status: updated.status };
  }
}

// Client filenames are untrusted; keep only a short alphanumeric extension.
function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}
