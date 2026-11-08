import { randomUUID } from "node:crypto";
import { extname, parse } from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { StoragePort, UploadedPart } from "@yt/ports";
import type { AuthUser } from "../auth/auth-user.js";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import type { Video } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import {
  MAX_PARTS,
  type MultipartInitRequest,
  type MultipartInitResponse,
  type PartUrlsResponse,
  type UploadedPartsResponse,
} from "./multipart.dto.js";
import type { ConfirmUploadResponse, PresignRequest, PresignResponse } from "./presign.dto.js";

const UPLOAD_URL_EXPIRY_SECONDS = 900;
// A big file takes a while; part URLs are requested per batch but live longer.
const PART_URL_EXPIRY_SECONDS = 3600;
const BYTES_PER_MB = 1024 * 1024;

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

  async startMultipartUpload(
    request: MultipartInitRequest,
    user: AuthUser,
  ): Promise<MultipartInitResponse> {
    const videoId = randomUUID();
    const bucket = this.config.STORAGE_RAW_BUCKET;
    const key = `${videoId}/source${safeExtension(request.filename)}`;
    const { partSize, partCount } = planParts(request.fileSize, this.config.UPLOAD_PART_SIZE_MB);

    const uploadId = await this.storage.createMultipartUpload(bucket, key, {
      contentType: request.contentType,
    });

    try {
      await this.prisma.video.create({
        data: {
          id: videoId,
          title: request.title ?? parse(request.filename).name,
          description: request.description,
          rawBucket: bucket,
          rawKey: key,
          contentType: request.contentType,
          ownerId: user.id,
          uploadId,
          partSize,
          partCount,
          fileSize: BigInt(request.fileSize),
        },
      });
    } catch (error) {
      // Without a row nothing could ever clean this upload up, so undo it now.
      await this.storage.abortMultipartUpload(bucket, key, uploadId);
      throw error;
    }

    return { videoId, partSize, partCount };
  }

  async createPartUrls(
    videoId: string,
    partNumbers: number[],
    user: AuthUser,
  ): Promise<PartUrlsResponse> {
    const video = await this.findOwnedPendingMultipart(videoId, user);
    const outOfRange = partNumbers.find((n) => n > (video.partCount ?? 0));
    if (outOfRange !== undefined) {
      throw new BadRequestException(`Part ${outOfRange} is beyond the ${video.partCount} parts`);
    }

    const urls = await Promise.all(
      [...new Set(partNumbers)].map(async (partNumber) => ({
        partNumber,
        url: await this.storage.createPresignedPartUrl(
          video.rawBucket,
          video.rawKey,
          video.uploadId ?? "",
          partNumber,
          { expiresInSeconds: PART_URL_EXPIRY_SECONDS },
        ),
      })),
    );
    return { urls, expiresInSeconds: PART_URL_EXPIRY_SECONDS };
  }

  async listUploadedParts(videoId: string, user: AuthUser): Promise<UploadedPartsResponse> {
    const video = await this.findOwnedPendingMultipart(videoId, user);
    const uploadedParts = await this.storage.listUploadedParts(
      video.rawBucket,
      video.rawKey,
      video.uploadId ?? "",
    );
    return {
      partSize: video.partSize ?? 0,
      partCount: video.partCount ?? 0,
      uploadedParts: [...uploadedParts].sort((a, b) => a.partNumber - b.partNumber),
    };
  }

  async abortUpload(videoId: string, user: AuthUser): Promise<void> {
    const video = await this.findOwned(videoId, user);
    if (video.status !== VideoStatus.PENDING) {
      throw new ConflictException("Only an unfinished upload can be aborted");
    }
    if (video.uploadId) {
      await this.storage.abortMultipartUpload(video.rawBucket, video.rawKey, video.uploadId);
    }
    await this.storage.deleteObject(video.rawBucket, video.rawKey);
    await this.prisma.video.delete({ where: { id: videoId } });
  }

  async confirmUpload(videoId: string, user: AuthUser): Promise<ConfirmUploadResponse> {
    const video = await this.findOwned(videoId, user);
    if (video.status !== VideoStatus.PENDING) {
      return { videoId, status: video.status };
    }

    const exists = await this.storage.objectExists(video.rawBucket, video.rawKey);
    // A retry after storage joined the parts but the database update failed lands here.
    if (!exists && video.uploadId) {
      await this.completeMultipart(video);
    } else if (!exists) {
      throw new ConflictException("File has not been uploaded to storage yet");
    }

    const updated = await this.prisma.video.update({
      where: { id: videoId },
      data: { status: VideoStatus.UPLOADED },
    });
    return { videoId, status: updated.status };
  }

  private async completeMultipart(video: Video): Promise<void> {
    const uploadId = video.uploadId ?? "";
    const parts = await this.storage.listUploadedParts(video.rawBucket, video.rawKey, uploadId);
    if (parts.length !== video.partCount) {
      throw new ConflictException(`Uploaded ${parts.length} of ${video.partCount} parts`);
    }
    const mismatch = findSizeMismatch(parts, video);
    if (mismatch) {
      throw new ConflictException(mismatch);
    }
    await this.storage.completeMultipartUpload(video.rawBucket, video.rawKey, uploadId);
  }

  private async findOwned(videoId: string, user: AuthUser): Promise<Video> {
    const video = await this.prisma.video.findUnique({ where: { id: videoId } });
    if (!video) {
      throw new NotFoundException(`Video ${videoId} not found`);
    }
    if (video.ownerId !== user.id) {
      throw new ForbiddenException("Only the uploader can change this video");
    }
    return video;
  }

  private async findOwnedPendingMultipart(videoId: string, user: AuthUser): Promise<Video> {
    const video = await this.findOwned(videoId, user);
    if (video.status !== VideoStatus.PENDING || !video.uploadId) {
      throw new ConflictException("Not an unfinished multipart upload");
    }
    return video;
  }
}

// Every part but the last must be exactly `partSize`, and the last holds the remainder, so a
// complete set also adds up to the declared file size. Rows from before the size was stored skip this.
function findSizeMismatch(parts: UploadedPart[], video: Video): string | null {
  const { partSize, partCount, fileSize } = video;
  if (partSize === null || partCount === null || fileSize === null) {
    return null;
  }
  const lastPartSize = Number(fileSize) - (partCount - 1) * partSize;
  for (const { partNumber, size } of parts) {
    if (partNumber < 1 || partNumber > partCount) {
      return `Unexpected part ${partNumber}`;
    }
    const expected = partNumber === partCount ? lastPartSize : partSize;
    if (size !== expected) {
      return `Part ${partNumber} has ${size} bytes, expected ${expected}`;
    }
  }
  return null;
}
// Storage allows at most 10,000 parts, so very large files get bigger parts.
function planParts(fileSize: number, configuredPartSizeMb: number) {
  const partSize = Math.max(configuredPartSizeMb * BYTES_PER_MB, Math.ceil(fileSize / MAX_PARTS));
  return { partSize, partCount: Math.ceil(fileSize / partSize) };
}

// Client filenames are untrusted; keep only a short alphanumeric extension.
function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}
