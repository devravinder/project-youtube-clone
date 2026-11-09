import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { Consumer, type MessagesStream, stringDeserializers } from "@platformatic/kafka";
import { EVENT_TYPE_HEADER } from "@yt/contracts";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { Notifier } from "./notifier.js";

const MAX_BACKOFF_MS = 30_000;

@Injectable()
export class KafkaListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaListener.name);
  // Own group per instance: each one must see every event, because each holds different sockets.
  readonly groupId: string;
  private consumer: Consumer<string, string, string, string> | null = null;
  private stream: MessagesStream<string, string, string, string> | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(Notifier) private readonly notifier: Notifier,
  ) {
    this.groupId = `${config.KAFKA_GROUP_PREFIX}-${randomUUID().slice(0, 8)}`;
  }

  onApplicationBootstrap(): void {
    this.running = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.stream?.close().catch(() => undefined);
    await this.running;
  }

  private async run(): Promise<void> {
    for (let attempt = 0; !this.stopping; attempt++) {
      try {
        await this.consume();
        attempt = 0;
      } catch (error) {
        if (this.stopping) break;
        const delay = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        this.logger.warn(
          `Kafka consumer failed, restarting in ${delay} ms: ${(error as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        await this.consumer?.close(true).catch(() => undefined);
        this.consumer = null;
      }
    }
  }

  private async consume(): Promise<void> {
    this.consumer = new Consumer({
      groupId: this.groupId,
      clientId: "notification-service",
      bootstrapBrokers: this.config.KAFKA_BROKERS,
      deserializers: stringDeserializers,
    });
    // latest + never commit: only what happens from now on, and no offsets left behind in Kafka.
    this.stream = await this.consumer.consume({
      topics: [this.config.KAFKA_VIDEO_EVENTS_TOPIC],
      mode: "latest",
      autocommit: false,
      maxWaitTime: 500,
    });
    this.logger.log(
      `Listening to ${this.config.KAFKA_VIDEO_EVENTS_TOPIC} as group ${this.groupId}`,
    );
    for await (const message of this.stream) {
      this.notifier.handle(message.value, message.headers.get(EVENT_TYPE_HEADER));
    }
  }
}
