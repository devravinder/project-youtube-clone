import type { VideoEvent } from "@yt/contracts";

export interface VideoEventsPort {
  // Resolves only after every in-sync replica stored the event (acks=all).
  publish(event: VideoEvent): Promise<void>;
}
