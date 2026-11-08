import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { TranscodeCommand, TranscodeQueuePort } from "@yt/ports";
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type RecoveringChannelModel,
} from "amqplib";
import {
  declareTranscodeTopology,
  TRANSCODE_EXCHANGE,
  TRANSCODE_MESSAGE_TYPE,
  TRANSCODE_ROUTING_KEY,
} from "./transcode-topology.js";

// One connection with automatic reconnect; channels are not recovered, so reopen per connect.
export class AmqpTranscodeQueue implements TranscodeQueuePort, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpTranscodeQueue.name);
  private connection: RecoveringChannelModel | null = null;
  private model: ChannelModel | null = null;
  private channel: Promise<ConfirmChannel> | null = null;

  constructor(private readonly url: string) {}

  async onModuleInit(): Promise<void> {
    // waitForConnect false: the API starts even when the broker is down.
    this.connection = await connect(this.url, {
      recovery: {
        maxDelay: 10_000,
        waitForConnect: false,
        setup: async (model: ChannelModel) => {
          this.model = model;
          this.channel = null;
          await this.getChannel();
        },
      },
    });
    this.connection.on("connect", () => this.logger.log("Connected to RabbitMQ"));
    this.connection.on("disconnect", (error: Error) => {
      this.model = null;
      this.channel = null;
      this.logger.warn(`RabbitMQ disconnected: ${error.message}`);
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

  async requestTranscode(command: TranscodeCommand): Promise<void> {
    const channel = await this.getChannel();
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        TRANSCODE_EXCHANGE,
        TRANSCODE_ROUTING_KEY,
        Buffer.from(JSON.stringify(command)),
        {
          persistent: true,
          contentType: "application/json",
          messageId: command.messageId,
          type: TRANSCODE_MESSAGE_TYPE,
          timestamp: Math.floor(Date.now() / 1000),
        },
        (error: unknown) => (error ? reject(new Error("Broker did not confirm")) : resolve()),
      );
    });
  }

  private getChannel(): Promise<ConfirmChannel> {
    if (!this.model) {
      return Promise.reject(new Error("Not connected to RabbitMQ"));
    }
    this.channel ??= this.openChannel(this.model);
    return this.channel;
  }

  private async openChannel(model: ChannelModel): Promise<ConfirmChannel> {
    const opening = model.createConfirmChannel();
    try {
      const channel = await opening;
      // A channel can close alone, e.g. after a declare with different arguments.
      channel.on("close", () => {
        if (this.model === model) {
          this.channel = null;
        }
      });
      channel.on("error", (error: Error) =>
        this.logger.error(`RabbitMQ channel error: ${error.message}`),
      );
      await declareTranscodeTopology(channel);
      return channel;
    } catch (error) {
      this.channel = null;
      throw error;
    }
  }
}
