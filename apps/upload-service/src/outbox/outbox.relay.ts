import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { TranscodeCommand, TranscodeQueuePort } from "@yt/ports";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { TRANSCODE_QUEUE_PORT } from "../messaging/messaging.module.js";
import { TRANSCODE_MESSAGE_TYPE } from "../messaging/transcode-topology.js";
import { type ClaimedMessage, OUTBOX_STORE, type OutboxStore } from "./outbox.store.js";

const BATCH_SIZE = 50;
const LEASE_SECONDS = 30;
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
  };

  constructor(
    @Inject(OUTBOX_STORE) private readonly store: OutboxStore,
    @Inject(TRANSCODE_QUEUE_PORT) private readonly queue: TranscodeQueuePort,
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

  // Overlapping ticks share the run in progress.
  drain(): Promise<number> {
    this.running ??= this.drainAll().finally(() => {
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
          sent += (await this.publish(message)) ? 1 : 0;
        }
      }
    } catch (error) {
      // Database trouble: try again on the next tick.
      this.logger.error(`Outbox relay stopped: ${(error as Error).message}`);
      return sent;
    }
  }

  private async publish(message: ClaimedMessage): Promise<boolean> {
    try {
      await this.publishers[message.type]?.(message.payload);
      await this.store.markSent(message.id);
      return true;
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
      return false;
    }
  }
}
