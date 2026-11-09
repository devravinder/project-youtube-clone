import type { VideoCachePort } from "../cache/video-cache.js";
import type { ViewCounterPort } from "../cache/view-counter.js";
import type { Video } from "../generated/prisma/client.js";

export class FakeVideoCache implements VideoCachePort {
  readonly entries = new Map<string, Video>();
  readonly evicted: string[] = [];
  hits = 0;

  async get(id: string): Promise<Video | null> {
    const video = this.entries.get(id) ?? null;
    if (video) this.hits++;
    return video;
  }

  async set(video: Video): Promise<void> {
    this.entries.set(video.id, video);
  }

  async evict(id: string): Promise<void> {
    this.evicted.push(id);
    this.entries.delete(id);
  }
}

export class FakeViewCounter implements ViewCounterPort {
  readonly counts = new Map<string, number>();
  readonly seen = new Set<string>();
  failWith: Error | null = null;

  async record(videoId: string, viewerKey: string): Promise<boolean> {
    if (this.failWith) throw this.failWith;
    const key = `${videoId}:${viewerKey}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.counts.set(videoId, (this.counts.get(videoId) ?? 0) + 1);
    return true;
  }

  async pending(videoId: string): Promise<number> {
    return this.counts.get(videoId) ?? 0;
  }

  async take(limit: number): Promise<Map<string, number>> {
    if (this.failWith) throw this.failWith;
    const taken = new Map([...this.counts].slice(0, limit));
    for (const id of taken.keys()) this.counts.delete(id);
    return taken;
  }

  async giveBack(counts: Map<string, number>): Promise<void> {
    for (const [id, n] of counts) this.counts.set(id, (this.counts.get(id) ?? 0) + n);
  }
}
