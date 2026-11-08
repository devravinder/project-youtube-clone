import type { Channel } from "amqplib";

// Same names and arguments as the transcoder's TranscodeTopology and MessagingConfig.
export const TRANSCODE_EXCHANGE = "yt.transcode";
export const TRANSCODE_ROUTING_KEY = "transcode.cmd";
export const TRANSCODE_QUEUE = "transcoder.transcode-video";
export const TRANSCODE_DLX = "yt.transcode.dlx";
export const TRANSCODE_DLQ = "transcoder.transcode-video.dlq";
export const TRANSCODE_MESSAGE_TYPE = "transcode.command.v1";

// RabbitMQ rejects a redeclare whose arguments differ, so keep these in step with Java.
export const TRANSCODE_QUEUE_ARGUMENTS = {
  "x-queue-type": "quorum",
  "x-dead-letter-exchange": TRANSCODE_DLX,
  "x-dead-letter-routing-key": TRANSCODE_ROUTING_KEY,
} as const;

// Declaring the queue too means commands are kept even before the transcoder first starts.
export async function declareTranscodeTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(TRANSCODE_EXCHANGE, "direct", { durable: true });
  await channel.assertExchange(TRANSCODE_DLX, "direct", { durable: true });
  await channel.assertQueue(TRANSCODE_QUEUE, {
    durable: true,
    arguments: TRANSCODE_QUEUE_ARGUMENTS,
  });
  await channel.assertQueue(TRANSCODE_DLQ, {
    durable: true,
    arguments: { "x-queue-type": "quorum" },
  });
  await channel.bindQueue(TRANSCODE_QUEUE, TRANSCODE_EXCHANGE, TRANSCODE_ROUTING_KEY);
  await channel.bindQueue(TRANSCODE_DLQ, TRANSCODE_DLX, TRANSCODE_ROUTING_KEY);
}
