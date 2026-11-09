import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import {
  Consumer,
  type MessagesStream,
  Producer,
  stringDeserializers,
  stringSerializers,
} from "@platformatic/kafka";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { withConsumerSpan } from "@yt/telemetry";
import { SEARCH_INDEX_PORT, type SearchIndexPort } from "../search/search-index.port.js";
import {
  EventProcessor,
  type IncomingEvent,
  retryDelayMs,
  StoppedError,
} from "./event-processor.js";

type StringStream = MessagesStream<string, string, string, string>;

@Injectable()
export class KafkaIndexer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaIndexer.name);
  private readonly processor: EventProcessor;
  private readonly dlt: Producer<string, string, string, string>;
  private readonly dltTopic: string;
  private consumer: Consumer<string, string, string, string> | null = null;
  private stream: StringStream | null = null;
  private running: Promise<void> | null = null;
  private stopping = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SEARCH_INDEX_PORT) private readonly index: SearchIndexPort,
  ) {
    this.dltTopic = `${config.KAFKA_VIDEO_EVENTS_TOPIC}.dlt`;
    this.dlt = new Producer({
      clientId: "search-service-dlt",
      bootstrapBrokers: config.KAFKA_BROKERS,
      serializers: stringSerializers,
      idempotent: true,
      acks: -1,
    });
    this.processor = new EventProcessor(index, (event, reason) => this.deadLetter(event, reason));
  }

  // Not awaited: the HTTP API serves what is indexed even while Kafka or Elasticsearch is down.
  onApplicationBootstrap(): void {
    this.running = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    this.processor.stop();
    await this.stream?.close().catch(() => undefined);
    await this.running;
    await this.dlt.close().catch(() => undefined);
  }

  private async run(): Promise<void> {
    try {
      await this.processor.retry("prepare index", () => this.index.ensureIndex());
    } catch (error) {
      if (error instanceof StoppedError) return;
      throw error;
    }
    for (let attempt = 0; !this.stopping; attempt++) {
      try {
        await this.consume();
        attempt = 0;
      } catch (error) {
        if (this.stopping || error instanceof StoppedError) break;
        const delay = retryDelayMs(attempt);
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
      groupId: this.config.KAFKA_GROUP_ID,
      clientId: "search-service",
      bootstrapBrokers: this.config.KAFKA_BROKERS,
      deserializers: stringDeserializers,
    });
    // committed: resume where the group left off; a brand-new group starts at the beginning.
    this.stream = await this.consumer.consume({
      topics: [this.config.KAFKA_VIDEO_EVENTS_TOPIC],
      mode: "committed",
      fallbackMode: "earliest",
      autocommit: false,
      maxWaitTime: 1000,
    });
    this.logger.log(
      `Consuming ${this.config.KAFKA_VIDEO_EVENTS_TOPIC} as group ${this.config.KAFKA_GROUP_ID}`,
    );
    // One at a time keeps each partition in order and gives natural back-pressure.
    for await (const message of this.stream) {
      // Continues the trace the producer put in the headers: the upload, all the way here.
      await withConsumerSpan(
        `${message.topic} process`,
        message.headers,
        {
          "messaging.system": "kafka",
          "messaging.operation.type": "process",
          "messaging.destination.name": message.topic,
          "messaging.consumer.group.name": this.config.KAFKA_GROUP_ID,
          "messaging.destination.partition.id": String(message.partition),
          "messaging.kafka.offset": Number(message.offset),
        },
        () => this.processor.process(message as IncomingEvent),
      );
    }
  }

  private async deadLetter(event: IncomingEvent, reason: string): Promise<void> {
    await this.dlt.send({
      messages: [
        {
          topic: this.dltTopic,
          key: event.key,
          value: event.value ?? "",
          headers: {
            ...Object.fromEntries(event.headers),
            "dlt-reason": reason,
            "dlt-source": `${event.topic}/${event.partition}@${event.offset}`,
            "dlt-consumer": this.config.KAFKA_GROUP_ID,
          },
        },
      ],
    });
  }
}
