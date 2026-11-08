import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { CleanupModule } from "./cleanup/cleanup.module.js";
import { AppConfigModule } from "./config/app.config.js";
import { OutboxModule } from "./outbox/outbox.module.js";
import { UploadsModule } from "./uploads/uploads.module.js";
import { VideosModule } from "./videos/videos.module.js";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    UploadsModule,
    VideosModule,
    CleanupModule,
    OutboxModule,
  ],
})
export class AppModule {}
