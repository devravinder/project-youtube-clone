import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

@Module({
  imports: [StorageModule, PrismaModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
