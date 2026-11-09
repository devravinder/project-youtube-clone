import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { AmqpTranscodeQueue } from "./amqp-transcode-queue.adapter.js";
import { KafkaVideoEvents } from "./kafka-video-events.adapter.js";

export const TRANSCODE_QUEUE_PORT = Symbol("TRANSCODE_QUEUE_PORT");
export const VIDEO_EVENTS_PORT = Symbol("VIDEO_EVENTS_PORT");

@Module({
  providers: [
    {
      provide: TRANSCODE_QUEUE_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new AmqpTranscodeQueue(config.RABBITMQ_URL),
    },
    {
      provide: VIDEO_EVENTS_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new KafkaVideoEvents(config.KAFKA_BROKERS, config.KAFKA_VIDEO_EVENTS_TOPIC),
    },
  ],
  exports: [TRANSCODE_QUEUE_PORT, VIDEO_EVENTS_PORT],
})
export class MessagingModule {}
