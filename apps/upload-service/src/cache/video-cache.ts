import type { Video } from "../generated/prisma/client.js";
import type { RedisGuard } from "./redis.client.js";

export interface VideoCachePort {
  get(id: string): Promise<Video | null>;
  set(video: Video): Promise<void>;
  evict(id: string): Promise<void>;
}

export const VIDEO_CACHE = Symbol("VIDEO_CACHE");

const key = (id: string) => `video:${id}`;

// JSON has no BigInt or Date, so those two travel as strings and are rebuilt on read.
export function encodeVideo(video: Video): string {
  return JSON.stringify(video, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}

export function decodeVideo(raw: string): Video {
  const v = JSON.parse(raw);
  return {
    ...v,
    viewCount: BigInt(v.viewCount),
    fileSize: v.fileSize === null ? null : BigInt(v.fileSize),
    createdAt: new Date(v.createdAt),
    updatedAt: new Date(v.updatedAt),
  };
}

/** Cache-aside for video rows. Fails open: any Redis problem is a cache miss, never a failed request. */
export class RedisVideoCache implements VideoCachePort {
  constructor(
    private readonly guard: RedisGuard,
    private readonly ttlSeconds: number,
  ) {}

  async get(id: string): Promise<Video | null> {
    try {
      const raw = await this.guard.run((r) => r.get(key(id)));
      return raw ? decodeVideo(raw) : null;
    } catch {
      return null;
    }
  }

  async set(video: Video): Promise<void> {
    // TTL bounds how long a missed eviction can serve stale data.
    await this.guard
      .run((r) =>
        r.set(key(video.id), encodeVideo(video), {
          expiration: { type: "EX", value: this.ttlSeconds },
        }),
      )
      .catch(() => undefined);
  }

  // A failed eviction is covered by the TTL.
  async evict(id: string): Promise<void> {
    await this.guard.run((r) => r.del(key(id))).catch(() => undefined);
  }
}
