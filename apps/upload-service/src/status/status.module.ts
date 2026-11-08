import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AmqpVideoStatusConsumer } from "./amqp-video-status.consumer.js";
import { VideoStatusService } from "./video-status.service.js";

@Module({
  imports: [PrismaModule],
  providers: [
    VideoStatusService,
    {
      provide: AmqpVideoStatusConsumer,
      inject: [APP_CONFIG, VideoStatusService],
      useFactory: (config: AppConfig, status: VideoStatusService) =>
        new AmqpVideoStatusConsumer(config.RABBITMQ_URL, (event) => status.apply(event)),
    },
  ],
})
export class StatusModule {}
