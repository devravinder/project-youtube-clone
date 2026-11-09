import { Logger } from "@nestjs/common";
import { metrics } from "@opentelemetry/api";
import { VIDEO_READY, videoEventSchema } from "@yt/contracts";
import type { ClientHub } from "./client-hub.js";

const SEEN_LIMIT = 1000;

const meter = metrics.getMeter("notification-service");
const handled = meter.createCounter("yt.notifications", {
  description:
    "Video events turned into socket messages (delivered) or dropped (ignored), by reason",
});

export type Delivery =
  { kind: "delivered"; published: number; owner: number } | { kind: "ignored"; reason: string };

/** Turns video events into socket messages: deduped, fresh only, owner told personally. */
export class Notifier {
  private readonly logger = new Logger(Notifier.name);
  // Insertion-ordered, so the oldest id is dropped first.
  private readonly seen = new Set<string>();

  constructor(
    private readonly hub: ClientHub,
    private readonly maxAgeMs: number,
    private readonly now: () => number = Date.now,
  ) {
    meter
      .createObservableGauge("yt.notifications.sockets", {
        description: "Open sockets on this instance",
      })
      .addCallback((result) => result.observe(this.hub.size));
  }

  handle(value: string | undefined, typeHeader: string | undefined): Delivery {
    const delivery = this.route(value, typeHeader);
    handled.add(1, {
      result: delivery.kind,
      reason: delivery.kind === "ignored" ? delivery.reason : "",
    });
    return delivery;
  }

  private route(value: string | undefined, typeHeader: string | undefined): Delivery {
    if (typeHeader && typeHeader !== VIDEO_READY) {
      return { kind: "ignored", reason: `type ${typeHeader}` };
    }
    let json: unknown;
    try {
      json = JSON.parse(value ?? "");
    } catch {
      return this.ignore("value is not JSON");
    }
    const parsed = videoEventSchema.safeParse(json);
    if (!parsed.success) {
      return this.ignore("invalid event");
    }
    const event = parsed.data;
    // The outbox delivers at least once; a second toast for the same event would be a bug to users.
    if (this.seen.has(event.eventId)) {
      return { kind: "ignored", reason: "duplicate" };
    }
    this.remember(event.eventId);
    if (this.now() - Date.parse(event.occurredAt) > this.maxAgeMs) {
      return { kind: "ignored", reason: "too old" };
    }
    const data = { videoId: event.video.id, title: event.video.title };
    const owner = event.video.ownerId;
    return {
      kind: "delivered",
      published: this.hub.broadcast({ event: "video.published", data }, owner),
      owner: owner ? this.hub.sendToUser(owner, { event: "video.ready", data }) : 0,
    };
  }

  // Nothing to retry or dead-letter: search-service owns the DLT for bad events.
  private ignore(reason: string): Delivery {
    this.logger.warn(`Ignoring event: ${reason}`);
    return { kind: "ignored", reason };
  }

  private remember(eventId: string): void {
    this.seen.add(eventId);
    if (this.seen.size > SEEN_LIMIT) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }
}
