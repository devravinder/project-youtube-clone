import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/app.config.js";
import { UploadsModule } from "./uploads/uploads.module.js";
import { VideosModule } from "./videos/videos.module.js";

@Module({
  imports: [AppConfigModule, UploadsModule, VideosModule],
})
export class AppModule {}
