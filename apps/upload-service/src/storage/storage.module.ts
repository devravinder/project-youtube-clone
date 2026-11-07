import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { S3StorageAdapter } from "./s3-storage.adapter.js";

export const STORAGE_PORT = Symbol("STORAGE_PORT");

@Module({
  providers: [
    {
      provide: STORAGE_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new S3StorageAdapter(config),
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
