import { Global, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { connectRedis, REDIS_GUARD, RedisGuard } from "./redis.client.js";
import { RedisVideoCache, VIDEO_CACHE } from "./video-cache.js";
import { RedisViewCounter, VIEW_COUNTER } from "./view-counter.js";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_GUARD,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new RedisGuard(connectRedis(c.REDIS_URL)),
    },
    {
      provide: VIDEO_CACHE,
      inject: [REDIS_GUARD, APP_CONFIG],
      useFactory: (guard: RedisGuard, c: AppConfig) =>
        new RedisVideoCache(guard, c.VIDEO_CACHE_TTL_SECONDS),
    },
    {
      provide: VIEW_COUNTER,
      inject: [REDIS_GUARD, APP_CONFIG],
      useFactory: (guard: RedisGuard, c: AppConfig) =>
        new RedisViewCounter(guard, c.VIEW_DEDUPE_MINUTES * 60),
    },
  ],
  exports: [VIDEO_CACHE, VIEW_COUNTER],
})
export class CacheModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_GUARD) private readonly guard: RedisGuard) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.guard.redis.isOpen) await this.guard.redis.close().catch(() => undefined);
  }
}
