import type { RedisGuard } from "./redis.client.js";

export interface ViewCounterPort {
  /** false when this viewer was already counted within the window. Throws when Redis fails. */
  record(videoId: string, viewerKey: string): Promise<boolean>;
  /** Views counted but not yet in Postgres; 0 when Redis is down. */
  pending(videoId: string): Promise<number>;
  /** Takes the pending counts of up to `limit` videos; other replicas get other videos. */
  take(limit: number): Promise<Map<string, number>>;
  /** Puts counts back after a failed database write. */
  giveBack(counts: Map<string, number>): Promise<void>;
}

export const VIEW_COUNTER = Symbol("VIEW_COUNTER");

const DIRTY = "views:dirty";
const PENDING = "views:pending:";
const SEEN = "views:seen:";

// One atomic step: a viewer is never marked seen without the view being counted, or the reverse.
// Counters get no TTL, so volatile-lru can evict cache entries but never unflushed views.
const RECORD = `
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[1]) then
  redis.call('INCR', KEYS[2])
  redis.call('SADD', KEYS[3], ARGV[2])
  return 1
end
return 0`;

// SPOP is atomic, so concurrent flushers never take the same video; GETDEL empties its counter.
const TAKE = `
local ids = redis.call('SPOP', KEYS[1], ARGV[1])
local out = {}
for _, id in ipairs(ids) do
  local n = redis.call('GETDEL', ARGV[2] .. id)
  if n then
    table.insert(out, id)
    table.insert(out, n)
  end
end
return out`;

/** Counts in Redis (one cheap script per view), flushed to Postgres in batches: eventual consistency. */
export class RedisViewCounter implements ViewCounterPort {
  constructor(
    private readonly guard: RedisGuard,
    private readonly dedupeSeconds: number,
  ) {}

  async record(videoId: string, viewerKey: string): Promise<boolean> {
    const added = await this.guard.run((r) =>
      r.eval(RECORD, {
        keys: [`${SEEN}${videoId}:${viewerKey}`, `${PENDING}${videoId}`, DIRTY],
        arguments: [String(this.dedupeSeconds), videoId],
      }),
    );
    return added === 1;
  }

  async pending(videoId: string): Promise<number> {
    try {
      return Number((await this.guard.run((r) => r.get(`${PENDING}${videoId}`))) ?? 0);
    } catch {
      return 0;
    }
  }

  async take(limit: number): Promise<Map<string, number>> {
    const flat = (await this.guard.run((r) =>
      r.eval(TAKE, { keys: [DIRTY], arguments: [String(limit), PENDING] }),
    )) as string[];
    const counts = new Map<string, number>();
    for (let i = 0; i < flat.length; i += 2) {
      counts.set(flat[i] as string, Number(flat[i + 1]));
    }
    return counts;
  }

  async giveBack(counts: Map<string, number>): Promise<void> {
    await this.guard.run((r) => {
      const multi = r.multi();
      for (const [id, n] of counts) {
        multi.incrBy(`${PENDING}${id}`, n).sAdd(DIRTY, id);
      }
      return multi.exec();
    });
  }
}
