import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CleanupModule } from "./cleanup/cleanup.module.js";
import { AppConfigModule } from "./config/app.config.js";
import { CacheModule } from "./cache/cache.module.js";
import { OutboxModule } from "./outbox/outbox.module.js";
import { StatusModule } from "./status/status.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";
import { VideosModule } from "./videos/videos.module.js";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    CacheModule,
    UploadsModule,
    VideosModule,
    CleanupModule,
    OutboxModule,
    StatusModule,
  ],
})
export class AppModule {}
