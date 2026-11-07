import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { StorageModule } from "../storage/storage.module.js";
import { CleanupService } from "./cleanup.service.js";

@Module({
  imports: [StorageModule, PrismaModule],
  providers: [CleanupService],
})
export class CleanupModule {}
