import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/app.config.js";
import { UploadsModule } from "./uploads/uploads.module.js";

@Module({
  imports: [AppConfigModule, UploadsModule],
})
export class AppModule {}
