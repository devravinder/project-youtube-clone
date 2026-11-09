import { Logger } from "@nestjs/common";
import { EVENT_TYPE_HEADER } from "@yt/contracts";
import type { SearchIndexPort } from "../search/search-index.port.js";
import { handleVideoEvent, type Outcome } from "./video-event-handler.js";

const MAX_BACKOFF_MS = 30_000;

export interface IncomingEvent {
  topic: string;
  partition: number;
  offset: bigint;
  key?: string;
  value?: string;
  headers: Map<string, string>;
  commit(): void | Promise<void>;
}

export type DeadLetter = (event: IncomingEvent, reason: string) => Promise<void>;

export class StoppedError extends Error {
  constructor() {
    super("Indexer is stopping");
  }
}

export const retryDelayMs = (attempt: number) => Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);

export class EventProcessor {
  private readonly logger = new Logger(EventProcessor.name);
  private stopping = false;

  constructor(
    private readonly index: SearchIndexPort,
    private readonly deadLetter: DeadLetter,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  stop(): void {
    this.stopping = true;
  }

  /** Commits only after the event is indexed, skipped or dead-lettered: at-least-once. */
  async process(event: IncomingEvent): Promise<Outcome> {
    const where = `${event.topic}/${event.partition}@${event.offset}`;
    const outcome = await this.retry(`index ${where}`, () =>
      handleVideoEvent(event.value, event.headers.get(EVENT_TYPE_HEADER), this.index),
    );
    if (outcome.kind === "dead-letter") {
      this.logger.warn(`Dead-lettering ${where}: ${outcome.reason}`);
      await this.retry(`dead-letter ${where}`, () => this.deadLetter(event, outcome.reason));
    } else if (outcome.kind !== "indexed") {
      this.logger.debug(`${outcome.kind} ${where}`);
    }
    await event.commit();
    return outcome;
  }

  // The partition waits while the index is down; skipping ahead would lose events.
  async retry<T>(what: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (this.stopping) throw new StoppedError();
      try {
        return await fn();
      } catch (error) {
        const delay = retryDelayMs(attempt);
        this.logger.warn(
          `${what} failed (attempt ${attempt + 1}), retrying in ${delay} ms: ${(error as Error).message}`,
        );
        await this.sleep(delay);
      }
    }
  }
}
