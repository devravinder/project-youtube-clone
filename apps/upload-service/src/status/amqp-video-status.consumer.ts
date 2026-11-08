import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  type ChannelModel,
  connect,
  type ConsumeMessage,
  type RecoveringChannelModel,
} from "amqplib";
import { declareStatusTopology, STATUS_QUEUE } from "../messaging/transcode-topology.js";
import { type VideoStatusEvent, videoStatusEventSchema } from "../messaging/video-status-event.js";

const PREFETCH = 10;
const REQUEUE_DELAY_MS = 1000;

export type StatusHandler = (event: VideoStatusEvent) => Promise<unknown>;

export type Settle = "ack" | "dead-letter" | "requeue";

// Decides the fate of one delivery; pure, so it is tested without a broker.
export async function handleDelivery(
  body: Buffer,
  handler: StatusHandler,
  logger: Pick<Logger, "warn" | "error">,
): Promise<Settle> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    logger.warn("Status event is not JSON; dead-lettering it");
    return "dead-letter";
  }
  const result = videoStatusEventSchema.safeParse(parsed);
  if (!result.success) {
    logger.warn(`Invalid status event; dead-lettering it: ${result.error.issues[0]?.message}`);
    return "dead-letter";
  }
  try {
    await handler(result.data);
    return "ack";
  } catch (error) {
    // Database trouble is transient; the event must not be lost.
    logger.error(`Could not apply status event: ${(error as Error).message}`);
    return "requeue";
  }
}

export class AmqpVideoStatusConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpVideoStatusConsumer.name);
  private connection: RecoveringChannelModel | null = null;

  constructor(
    private readonly url: string,
    private readonly handler: StatusHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connection = await connect(this.url, {
      recovery: {
        maxDelay: 10_000,
        waitForConnect: false,
        // Runs after every (re)connect, because channels and consumers are not recovered.
        setup: (model: ChannelModel) => this.consume(model),
      },
    });
    this.connection.on("connect-failed", (error: Error) =>
      this.logger.warn(`RabbitMQ connect failed: ${error.message}`),
    );
    this.connection.on("error", (error: Error) =>
      this.logger.error(`RabbitMQ error: ${error.message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close().catch(() => undefined);
  }

  private async consume(model: ChannelModel): Promise<void> {
    const channel = await model.createChannel();
    await declareStatusTopology(channel);
    await channel.prefetch(PREFETCH);
    await channel.consume(STATUS_QUEUE, (message: ConsumeMessage | null) => {
      if (!message) {
        return;
      }
      void handleDelivery(message.content, this.handler, this.logger).then(async (settle) => {
        if (settle === "ack") {
          channel.ack(message);
        } else if (settle === "dead-letter") {
          channel.nack(message, false, false);
        } else {
          await new Promise((resolve) => setTimeout(resolve, REQUEUE_DELAY_MS));
          channel.nack(message, false, true);
        }
      });
    });
    this.logger.log(`Consuming ${STATUS_QUEUE}`);
  }
}
