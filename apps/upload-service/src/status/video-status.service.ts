import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { VIDEO_CACHE, type VideoCachePort } from "../cache/video-cache.js";
import { VideoStatus } from "../generated/prisma/enums.js";
import { buildVideoReadyEvent, VIDEO_READY_MESSAGE_TYPE } from "../messaging/video-ready-event.js";
import type { VideoStatusEvent } from "../messaging/video-status-event.js";
import { PrismaService } from "../prisma/prisma.service.js";

// Only forward moves: a late or duplicate event cannot undo a newer state.
const ALLOWED_FROM: Record<VideoStatusEvent["status"], VideoStatus[]> = {
  PROCESSING: [VideoStatus.UPLOADED],
  // FAILED -> READY covers a dead-lettered command that was replayed and then succeeded.
  READY: [VideoStatus.UPLOADED, VideoStatus.PROCESSING, VideoStatus.FAILED],
  FAILED: [VideoStatus.UPLOADED, VideoStatus.PROCESSING],
};

@Injectable()
export class VideoStatusService {
  private readonly logger = new Logger(VideoStatusService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(VIDEO_CACHE) private readonly cache: VideoCachePort,
  ) {}

  /** Returns false when the event was stale or for an unknown video, which is not an error. */
  async apply(event: VideoStatusEvent): Promise<boolean> {
    // The video.ready event is written with the status change, so neither exists without the other.
    const applied = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.video.updateMany({
        where: { id: event.videoId, status: { in: ALLOWED_FROM[event.status] } },
        data: {
          status: event.status,
          ...(event.status === "READY" && {
            renditions: event.renditions,
            hlsMasterKey: event.masterPlaylist,
            failureReason: null,
          }),
          ...(event.status === "FAILED" && { failureReason: event.reason ?? "Transcoding failed" }),
        },
      });
      if (count === 0 || event.status !== "READY") {
        return count > 0;
      }
      const video = await tx.video.findUnique({ where: { id: event.videoId } });
      if (video) {
        const eventId = randomUUID();
        const ready = buildVideoReadyEvent(eventId, video, event.renditions, event.occurredAt);
        await tx.outboxMessage.create({
          data: { id: eventId, type: VIDEO_READY_MESSAGE_TYPE, payload: ready },
        });
      }
      return true;
    });
    if (!applied) {
      this.logger.debug(`Ignored ${event.status} for video ${event.videoId} (stale or unknown)`);
      return false;
    }
    // After the commit, so a reader cannot cache the old row again from an open transaction.
    await this.cache.evict(event.videoId);
    this.logger.log(`Video ${event.videoId} is now ${event.status}`);
    return true;
  }
}
