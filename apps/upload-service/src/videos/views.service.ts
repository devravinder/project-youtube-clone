import { createHash } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { RedisTimeoutError } from "../cache/redis.client.js";
import { VIDEO_CACHE, type VideoCachePort } from "../cache/video-cache.js";
import { untraced } from "@yt/telemetry";
import { VIEW_COUNTER, type ViewCounterPort } from "../cache/view-counter.js";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { VideosService } from "./videos.service.js";

const FLUSH_BATCH = 500;

// A hash, so raw IP addresses never reach Redis. Behind a proxy, req.ip needs `trust proxy`.
export function viewerKey(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${ip}|${userAgent}`).digest("base64url").slice(0, 22);
}

@Injectable()
export class ViewsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ViewsService.name);
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<number> | null = null;

  constructor(
    @Inject(VideosService) private readonly videos: VideosService,
    @Inject(VIEW_COUNTER) private readonly counter: ViewCounterPort,
    @Inject(VIDEO_CACHE) private readonly cache: VideoCachePort,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.flush(), this.config.VIEW_FLUSH_INTERVAL_MS);
    this.timer.unref();
  }

  // A last flush, so views counted just before a deploy are not left waiting in Redis.
  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** Returns whether this view counted. Only READY videos have views. */
  async record(videoId: string, viewer: string): Promise<boolean> {
    const video = await this.videos.find(videoId);
    if (!video || video.status !== VideoStatus.READY) {
      throw new NotFoundException(`Video ${videoId} is not playable`);
    }
    try {
      return await this.counter.record(videoId, viewer);
    } catch (error) {
      // Sent but unanswered: it may still count in Redis, so writing Postgres too could count twice.
      if (error instanceof RedisTimeoutError) {
        this.logger.warn(`View for ${videoId} accepted without confirmation: ${error.message}`);
        return true;
      }
      // Not applied in Redis: count straight into Postgres. Slower and not deduped, but not lost.
      this.logger.warn(`Counting view in Postgres, Redis failed: ${(error as Error).message}`);
      await this.increment(videoId, 1);
      return true;
    }
  }

  // Overlapping ticks share the run in progress; untraced, like the outbox poll.
  flush(): Promise<number> {
    this.flushing ??= untraced(() => this.flushAll()).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushAll(): Promise<number> {
    let flushed = 0;
    while (true) {
      let counts: Map<string, number>;
      try {
        counts = await this.counter.take(FLUSH_BATCH);
      } catch {
        return flushed; // Redis down: the counts stay there for the next tick.
      }
      if (counts.size === 0) return flushed;
      try {
        for (const [id, n] of counts) {
          await this.increment(id, n);
          counts.delete(id);
          flushed += n;
        }
      } catch (error) {
        this.logger.error(`View flush failed, putting counts back: ${(error as Error).message}`);
        await this.counter.giveBack(counts).catch(() => undefined);
        return flushed;
      }
    }
  }

  private async increment(id: string, n: number): Promise<void> {
    // updateMany: a video deleted meanwhile is skipped instead of failing the batch.
    await this.prisma.video.updateMany({ where: { id }, data: { viewCount: { increment: n } } });
    await this.cache.evict(id);
  }
}
