import type { Channel } from "amqplib";
import { describe, expect, it } from "vitest";
import { declareTranscodeTopology } from "./transcode-topology.js";

// Same expectations as the transcoder's MessagingConfigTest; RabbitMQ refuses a mismatch.
describe("declareTranscodeTopology", () => {
  it("declares the exchanges, quorum queues and bindings the transcoder expects", async () => {
    const calls: unknown[][] = [];
    const record =
      (name: string) =>
      async (...args: unknown[]) => {
        calls.push([name, ...args]);
      };
    const channel = {
      assertExchange: record("exchange"),
      assertQueue: record("queue"),
      bindQueue: record("bind"),
    } as unknown as Channel;

    await declareTranscodeTopology(channel);

    expect(calls).toEqual([
      ["exchange", "yt.transcode", "direct", { durable: true }],
      ["exchange", "yt.transcode.dlx", "direct", { durable: true }],
      [
        "queue",
        "transcoder.transcode-video",
        {
          durable: true,
          arguments: {
            "x-queue-type": "quorum",
            "x-dead-letter-exchange": "yt.transcode.dlx",
            "x-dead-letter-routing-key": "transcode.cmd",
          },
        },
      ],
      [
        "queue",
        "transcoder.transcode-video.dlq",
        { durable: true, arguments: { "x-queue-type": "quorum" } },
      ],
      ["bind", "transcoder.transcode-video", "yt.transcode", "transcode.cmd"],
      ["bind", "transcoder.transcode-video.dlq", "yt.transcode.dlx", "transcode.cmd"],
    ]);
  });
});
