import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { MessagingModule } from "../messaging/messaging.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { UploadsController } from "./uploads.controller.js";
import { UploadsService } from "./uploads.service.js";

@Module({
  imports: [AuthModule, StorageModule, PrismaModule, MessagingModule],
  controllers: [UploadsController],
  providers: [UploadsService],
})
export class UploadsModule {}
