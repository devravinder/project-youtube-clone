import { VIDEO_READY, type VideoReadyEvent, videoReadyEventSchema } from "@yt/contracts";
import type { Video } from "../generated/prisma/client.js";

export const VIDEO_READY_MESSAGE_TYPE = "video.ready.v1";

const heightOf = (name: string) => Number.parseInt(name, 10);

// Parsing here means a row that breaks the contract never reaches the outbox.
export function buildVideoReadyEvent(
  eventId: string,
  video: Video,
  renditions: { name: string }[],
  occurredAt: string,
): VideoReadyEvent {
  return videoReadyEventSchema.parse({
    eventId,
    type: VIDEO_READY,
    version: 1,
    occurredAt,
    video: {
      id: video.id,
      title: video.title,
      description: video.description,
      ownerId: video.ownerId,
      renditions: renditions.map((r) => r.name).sort((a, b) => heightOf(b) - heightOf(a)),
      createdAt: video.createdAt.toISOString(),
    },
  });
}
