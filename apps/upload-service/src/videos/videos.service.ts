import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { StoragePort } from "@yt/ports";
import type { Video } from "../generated/prisma/client.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";
import type { ListVideosQuery, VideoDetail, VideoPage, VideoSummary } from "./video.dto.js";

const PLAYBACK_URL_EXPIRY_SECONDS = 3600;

@Injectable()
export class VideosService {
  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async list({ limit, cursor }: ListVideosQuery): Promise<VideoPage> {
    // Fetch one extra row: it becomes the cursor that starts the next page.
    const rows = await this.prisma.video.findMany({
      where: { status: { not: VideoStatus.PENDING } },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit).map(toSummary),
      nextCursor: hasMore ? rows[limit].id : null,
    };
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
