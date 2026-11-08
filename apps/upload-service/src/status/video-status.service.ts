import { Inject, Injectable, Logger } from "@nestjs/common";
import { VideoStatus } from "../generated/prisma/enums.js";
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

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Returns false when the event was stale or for an unknown video, which is not an error. */
  async apply(event: VideoStatusEvent): Promise<boolean> {
    const { count } = await this.prisma.video.updateMany({
      where: { id: event.videoId, status: { in: ALLOWED_FROM[event.status] } },
      data: {
        status: event.status,
        ...(event.status === "READY" && { renditions: event.renditions, failureReason: null }),
        ...(event.status === "FAILED" && { failureReason: event.reason ?? "Transcoding failed" }),
      },
    });
    if (count === 0) {
      this.logger.debug(`Ignored ${event.status} for video ${event.videoId} (stale or unknown)`);
      return false;
    }
    this.logger.log(`Video ${event.videoId} is now ${event.status}`);
    return true;
  }
}
