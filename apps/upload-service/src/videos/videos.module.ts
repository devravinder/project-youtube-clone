import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { VideosController } from "./videos.controller.js";
import { VideosService } from "./videos.service.js";
import { ViewsService } from "./views.service.js";

@Module({
  imports: [StorageModule, PrismaModule],
  controllers: [VideosController],
  providers: [VideosService, ViewsService],
})
export class VideosModule {}
