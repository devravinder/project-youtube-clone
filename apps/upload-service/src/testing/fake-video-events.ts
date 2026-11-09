import type { VideoEvent } from "@yt/contracts";
import type { VideoEventsPort } from "@yt/ports";

export class FakeVideoEvents implements VideoEventsPort {
  readonly events: VideoEvent[] = [];
  failWith: Error | null = null;

  async publish(event: VideoEvent): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.events.push(event);
  }
}
