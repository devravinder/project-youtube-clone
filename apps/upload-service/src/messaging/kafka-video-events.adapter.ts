import type { OnModuleDestroy } from "@nestjs/common";
import { type MessageToProduce, Producer, stringSerializers } from "@platformatic/kafka";
import { EVENT_ID_HEADER, EVENT_TYPE_HEADER, type VideoEvent } from "@yt/contracts";
import type { VideoEventsPort } from "@yt/ports";
import { withProducerSpan } from "@yt/telemetry";

type StringMessage = MessageToProduce<string, string, string, string>;

// Key = videoId: same partition for every event of a video, so they stay in order.
export function toKafkaMessage(topic: string, event: VideoEvent): StringMessage {
  return {
    topic,
    key: event.video.id,
    value: JSON.stringify(event),
    headers: { [EVENT_TYPE_HEADER]: event.type, [EVENT_ID_HEADER]: event.eventId },
  };
}

export class KafkaVideoEvents implements VideoEventsPort, OnModuleDestroy {
  private readonly producer: Producer<string, string, string, string>;

  constructor(
    brokers: string[],
    private readonly topic: string,
  ) {
    // Idempotent: a retried send is stored once. acks -1: wait for every in-sync replica.
    this.producer = new Producer({
      clientId: "upload-service",
      bootstrapBrokers: brokers,
      serializers: stringSerializers,
      idempotent: true,
      acks: -1,
    });
  }

  async publish(event: VideoEvent): Promise<void> {
    const message = toKafkaMessage(this.topic, event);
    // No Kafka instrumentation for this client: the span and its traceparent header are added here.
    await withProducerSpan(
      `${this.topic} publish`,
      {
        "messaging.system": "kafka",
        "messaging.operation.type": "send",
        "messaging.destination.name": this.topic,
        "messaging.kafka.message.key": event.video.id,
        "messaging.message.id": event.eventId,
      },
      (trace) =>
        this.producer.send({
          messages: [{ ...message, headers: { ...message.headers, ...trace } }],
        }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.close().catch(() => undefined);
  }
}
