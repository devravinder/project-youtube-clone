import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { StoragePort } from "@yt/ports";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { STORAGE_PORT } from "../storage/storage.module.js";

const BATCH_SIZE = 100;
const MS_PER_MINUTE = 60_000;

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async removeAbandonedUploads(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.UPLOAD_PENDING_TTL_MINUTES * MS_PER_MINUTE);
    const abandoned = await this.prisma.video.findMany({
      where: { status: VideoStatus.PENDING, createdAt: { lt: cutoff } },
      take: BATCH_SIZE,
    });

    let removed = 0;
    for (const video of abandoned) {
      try {
        // Object first: a row without an object is harmless, the reverse leaks storage.
        await this.storage.deleteObject(video.rawBucket, video.rawKey);
        await this.prisma.video.delete({ where: { id: video.id } });
        removed += 1;
      } catch (error) {
        this.logger.error(`Could not clean up video ${video.id}`, error);
      }
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} abandoned uploads`);
    }
    return removed;
  }
}
