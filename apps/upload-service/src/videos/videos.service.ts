import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { StoragePort } from "@yt/ports";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
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
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async list({ limit, cursor }: ListVideosQuery): Promise<VideoPage> {
    // One extra row becomes the next cursor.
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

    const sign = { expiresInSeconds: PLAYBACK_URL_EXPIRY_SECONDS };
    const publicUrl = (key: string) => `${this.config.HLS_PUBLIC_BASE_URL}/${key}`;
    // Transcoded output is public (HLS segments cannot each be signed); only the original is private.
    const renditions =
      video.status === VideoStatus.READY
        ? storedRenditions(video.renditions).map(({ name, key }) => ({
            name,
            height: Number.parseInt(name, 10),
            playbackUrl: publicUrl(key),
          }))
        : [];
    renditions.sort((a, b) => b.height - a.height);

    let playbackUrl: string | null =
      video.status === VideoStatus.READY && video.hlsMasterKey
        ? publicUrl(video.hlsMasterKey)
        : (renditions[0]?.playbackUrl ?? null);
    if (!playbackUrl && (await this.storage.objectExists(video.rawBucket, video.rawKey))) {
      playbackUrl = await this.storage.createPresignedDownloadUrl(
        video.rawBucket,
        video.rawKey,
        sign,
      );
    }

    return {
      ...toSummary(video),
      contentType: video.contentType,
      playbackUrl,
      renditions,
      failureReason: video.failureReason,
    };
  }
}

// The column is written only from validated status events, but old or edited rows may differ.
function storedRenditions(value: unknown): { name: string; key: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (r): r is { name: string; key: string } =>
      typeof r?.name === "string" && /^\d+p$/.test(r.name) && typeof r?.key === "string",
  );
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
