import { Logger } from "@nestjs/common";
import { createClient } from "redis";

const MAX_RECONNECT_DELAY_MS = 5000;
// Redis answers in well under 1 ms; past this it counts as down.
export const COMMAND_TIMEOUT_MS = 500;
// After a failure, skip Redis this long instead of making every request wait for the timeout.
export const COOL_DOWN_MS = 5000;

const create = (url: string) =>
  createClient({
    url,
    // While disconnected, commands fail at once instead of waiting in memory for a reconnect.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries: number) => Math.min(200 * 2 ** retries, MAX_RECONNECT_DELAY_MS),
    },
  });

export type Redis = ReturnType<typeof create>;

/** The command was not sent, so nothing happened in Redis. */
export class RedisUnavailableError extends Error {}

/** The command was sent but not answered in time: it may still run later. */
export class RedisTimeoutError extends Error {}

export const REDIS_GUARD = Symbol("REDIS_GUARD");

/**
 * Bounds every Redis call. A paused or overloaded Redis keeps its socket open, so the client's
 * own offline handling never kicks in and commands would wait forever.
 */
export class RedisGuard {
  private readonly logger = new Logger("Redis");
  private openUntil = 0;

  constructor(
    readonly redis: Redis,
    private readonly timeoutMs = COMMAND_TIMEOUT_MS,
    private readonly coolDownMs = COOL_DOWN_MS,
    private readonly now: () => number = Date.now,
  ) {}

  async run<T>(op: (redis: Redis) => Promise<T>): Promise<T> {
    if (this.now() < this.openUntil || !this.redis.isReady) {
      throw new RedisUnavailableError("Redis is unavailable");
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new RedisTimeoutError(`No Redis answer within ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([op(this.redis), timeout]);
    } catch (error) {
      if (this.now() >= this.openUntil) {
        this.logger.warn(`Skipping Redis for ${this.coolDownMs} ms: ${(error as Error).message}`);
      }
      this.openUntil = this.now() + this.coolDownMs;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export function connectRedis(url: string, logger = new Logger("Redis")): Redis {
  const client = create(url);
  let down = false;
  client.on("error", (error: Error) => {
    if (!down) logger.warn(`Redis connection lost: ${error.message}`);
    down = true;
  });
  client.on("ready", () => {
    if (down) logger.log("Redis is back");
    down = false;
  });
  client.connect().catch(() => undefined);
  return client;
}
