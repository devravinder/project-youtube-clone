import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { StoragePort } from "@yt/ports";
import type { Video } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import type { VideoDetail, VideoSummary } from "./video.dto.js";

const LIST_LIMIT = 50;
const PLAYBACK_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class VideosService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list(): Promise<VideoSummary[]> {
    const videos = await this.prisma.video.findMany({
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
    return videos.map(toSummary);
  }

  async get(id: string): Promise<VideoDetail> {
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video) {
      throw new NotFoundException(`Video ${id} not found`);
    }

    const uploaded = await this.storage.objectExists(video.rawBucket, video.rawKey);
    const playbackUrl = uploaded
      ? await this.storage.createPresignedDownloadUrl(video.rawBucket, video.rawKey, {
          expiresInSeconds: PLAYBACK_URL_EXPIRY_SECONDS,
        })
      : null;

    return { ...toSummary(video), contentType: video.contentType, playbackUrl };
  }
}

// JSON cannot carry BigInt, so view counts go out as numbers.
function toSummary(video: Video): VideoSummary {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    status: video.status,
    viewCount: Number(video.viewCount),
    createdAt: video.createdAt.toISOString(),
  };
}
