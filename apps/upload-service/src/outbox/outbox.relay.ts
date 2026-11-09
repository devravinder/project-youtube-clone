import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { VideoEvent } from "@yt/contracts";
import type { TranscodeCommand, TranscodeQueuePort, VideoEventsPort } from "@yt/ports";
import { untraced, withStoredContext } from "@yt/telemetry";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { TRANSCODE_QUEUE_PORT, VIDEO_EVENTS_PORT } from "../messaging/messaging.module.js";
import { TRANSCODE_MESSAGE_TYPE } from "../messaging/transcode-topology.js";
import { VIDEO_READY_MESSAGE_TYPE } from "../messaging/video-ready-event.js";
import { type ClaimedMessage, OUTBOX_STORE, type OutboxStore } from "./outbox.store.js";

const BATCH_SIZE = 50;
const LEASE_SECONDS = 30;
export const PUBLISH_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MS_PER_HOUR = 3_600_000;

export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}

@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  private readonly publishers: Record<string, (payload: unknown) => Promise<void>> = {
    [TRANSCODE_MESSAGE_TYPE]: (payload) => this.queue.requestTranscode(payload as TranscodeCommand),
    [VIDEO_READY_MESSAGE_TYPE]: (payload) => this.events.publish(payload as VideoEvent),
  };

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(TRANSCODE_QUEUE_PORT) private readonly queue: TranscodeQueuePort,
    @Inject(VIDEO_EVENTS_PORT) private readonly events: VideoEventsPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.drain(), this.config.OUTBOX_POLL_INTERVAL_MS);
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.running;
  }

  // Overlapping ticks share the run in progress. Polling is untraced: a span per second is noise.
  drain(): Promise<number> {
    this.running ??= untraced(() => this.drainAll()).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeSent(): Promise<number> {
    const cutoff = new Date(Date.now() - this.config.OUTBOX_RETENTION_HOURS * MS_PER_HOUR);
    return this.store.deleteSentBefore(cutoff);
  }

  private async drainAll(): Promise<number> {
    let sent = 0;
    const unresponsive = new Set<string>();
    try {
      while (true) {
        const batch = await this.store.claimDue(
          Object.keys(this.publishers),
          BATCH_SIZE,
          LEASE_SECONDS,
        );
        if (batch.length === 0) {
          return sent;
        }
        for (const message of batch) {
          // Skipped rows stay leased, so they are due again once the lease runs out.
          if (unresponsive.has(message.type)) {
            continue;
          }
          const result = await this.publish(message);
          sent += result === "sent" ? 1 : 0;
          if (result === "timed-out") {
            unresponsive.add(message.type);
          }
        }
      }
    } catch (error) {
      // Database trouble: try again on the next tick.
      this.logger.error(`Outbox relay stopped: ${(error as Error).message}`);
      return sent;
    }
  }

  private async publish(message: ClaimedMessage): Promise<"sent" | "failed" | "timed-out"> {
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    // A hung broker must fail well inside the lease, or another relay re-claims the row.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(`No broker answer within ${PUBLISH_TIMEOUT_MS} ms`));
      }, PUBLISH_TIMEOUT_MS);
    });
    try {
      // Publish inside the trace of the request that wrote the row, seconds or minutes ago.
      const publish = this.publishers[message.type];
      await Promise.race([
        withStoredContext(message.traceContext, async () => publish?.(message.payload)),
        timeout,
      ]);
      await this.store.markSent(message.id);
      return "sent";
    } catch (error) {
      const delay = backoffMs(message.attempts);
      this.logger.warn(
        `Could not publish ${message.type} ${message.id} (attempt ${message.attempts + 1}), ` +
          `retrying in ${delay} ms: ${(error as Error).message}`,
      );
      await this.store.markFailed(
        message.id,
        (error as Error).message,
        new Date(Date.now() + delay),
      );
      return timedOut ? "timed-out" : "failed";
    } finally {
      clearTimeout(timer);
    }
  }
}
