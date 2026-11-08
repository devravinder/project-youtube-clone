import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { AmqpTranscodeQueue } from "./amqp-transcode-queue.adapter.js";

export const TRANSCODE_QUEUE_PORT = Symbol("TRANSCODE_QUEUE_PORT");

@Module({
  providers: [
    {
      provide: TRANSCODE_QUEUE_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new AmqpTranscodeQueue(config.RABBITMQ_URL),
    },
  ],
  exports: [TRANSCODE_QUEUE_PORT],
})
export class MessagingModule {}
