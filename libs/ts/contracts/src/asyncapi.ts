import { z } from "zod";
import {
  authResultMessageSchema,
  clientAuthMessageSchema,
  NOTIFICATIONS_PATH,
  videoPublishedMessageSchema,
  yourVideoReadyMessageSchema,
} from "./notifications.js";
import {
  EVENT_ID_HEADER,
  EVENT_TYPE_HEADER,
  VIDEO_EVENTS_DLT,
  VIDEO_EVENTS_TOPIC,
  VIDEO_READY,
  videoReadyEventSchema,
} from "./video-events.js";

// AsyncAPI 3 payloads default to the AsyncAPI schema format, a superset of JSON Schema draft-07.
function payload(schema: z.ZodType, io: "input" | "output" = "input"): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io }) as Record<string, unknown>;
  delete json["$schema"];
  return json;
}

const ref = (path: string) => ({ $ref: `#/${path}` });

const kafkaHeaders = {
  type: "object",
  required: [EVENT_TYPE_HEADER, EVENT_ID_HEADER],
  properties: {
    [EVENT_TYPE_HEADER]: {
      type: "string",
      description: "Event type; consumers skip types they do not know",
    },
    [EVENT_ID_HEADER]: {
      type: "string",
      format: "uuid",
      description: "Same as the payload's eventId",
    },
  },
};

const wsMessage = (name: string, schema: z.ZodType, summary: string) => ({
  name,
  title: name,
  summary,
  contentType: "application/json",
  payload: payload(schema),
});

/** The whole event-driven surface: Kafka topics between services, and the browser WebSocket. */
export function buildAsyncApiDocument(): Record<string, unknown> {
  return {
    asyncapi: "3.1.0",
    info: {
      title: "Mini YouTube events",
      version: "1.0.0",
      description:
        "Events between services (Kafka) and live notifications to browsers (WebSocket). " +
        "Generated from the Zod schemas in libs/ts/contracts; do not edit by hand.",
    },
    defaultContentType: "application/json",
    servers: {
      kafkaLocal: {
        host: "localhost:9094",
        protocol: "kafka",
        description: "Local compose broker (EXTERNAL listener); containers use kafka:9092",
      },
      notificationsLocal: {
        host: "localhost:3004",
        protocol: "ws",
        description: "notification-service; the web app reaches it as /ws on its own origin",
      },
    },
    channels: {
      videoEvents: {
        address: VIDEO_EVENTS_TOPIC,
        title: "Video events",
        description:
          "Facts about videos. Key = videoId, so one video's events stay in order. Compacted: the " +
          "latest event per video is kept, so a new consumer group can rebuild its state from the start.",
        servers: [ref("servers/kafkaLocal")],
        messages: { videoReady: ref("components/messages/VideoReady") },
        bindings: {
          kafka: {
            topic: VIDEO_EVENTS_TOPIC,
            partitions: 3,
            replicas: 1,
            topicConfiguration: { "cleanup.policy": ["compact"] },
            bindingVersion: "0.5.0",
          },
        },
      },
      videoEventsDeadLetter: {
        address: VIDEO_EVENTS_DLT,
        title: "Dead letters",
        description:
          "Events a consumer could not handle, unchanged, with dlt-* headers saying who, where and why. Kept 14 days.",
        servers: [ref("servers/kafkaLocal")],
        messages: { deadLetter: ref("components/messages/DeadLetter") },
      },
      notifications: {
        address: NOTIFICATIONS_PATH,
        title: "Browser notifications",
        description: "One socket per browser tab; { event, data } messages both ways.",
        servers: [ref("servers/notificationsLocal")],
        messages: {
          auth: ref("components/messages/Auth"),
          authResult: ref("components/messages/AuthResult"),
          videoPublished: ref("components/messages/VideoPublished"),
          yourVideoReady: ref("components/messages/YourVideoReady"),
        },
      },
    },
    operations: {
      publishVideoReady: {
        action: "send",
        channel: ref("channels/videoEvents"),
        title: "upload-service publishes video.ready",
        description:
          "Written to the outbox in the same transaction as the READY status, then sent by OutboxRelay " +
          "(acks=all, idempotent producer). At least once: consumers dedupe on eventId.",
        messages: [ref("channels/videoEvents/messages/videoReady")],
      },
      indexVideoEvents: {
        action: "receive",
        channel: ref("channels/videoEvents"),
        title: "search-service indexes videos",
        description:
          "One shared group, so instances split the partitions. Commits after indexing; external versions make replays harmless.",
        messages: [ref("channels/videoEvents/messages/videoReady")],
        bindings: {
          kafka: { groupId: { type: "string", enum: ["search-service"] }, bindingVersion: "0.5.0" },
        },
      },
      deadLetterVideoEvents: {
        action: "send",
        channel: ref("channels/videoEventsDeadLetter"),
        title: "search-service dead-letters bad events",
        messages: [ref("channels/videoEventsDeadLetter/messages/deadLetter")],
      },
      notifyVideoEvents: {
        action: "receive",
        channel: ref("channels/videoEvents"),
        title: "notification-service fans out to sockets",
        description:
          "A group per instance (notification-service-<random>), latest offset, never commits: every instance sees every event.",
        messages: [ref("channels/videoEvents/messages/videoReady")],
        bindings: {
          kafka: {
            groupId: { type: "string", pattern: "^notification-service-[0-9a-f]{8}$" },
            bindingVersion: "0.5.0",
          },
        },
      },
      receiveAuth: {
        action: "receive",
        channel: ref("channels/notifications"),
        title: "notification-service accepts a token",
        messages: [ref("channels/notifications/messages/auth")],
        reply: {
          channel: ref("channels/notifications"),
          messages: [ref("channels/notifications/messages/authResult")],
        },
      },
      pushNotifications: {
        action: "send",
        channel: ref("channels/notifications"),
        title: "notification-service pushes to browsers",
        description:
          "video.ready to the uploader's signed-in sockets, video.published to everyone else.",
        messages: [
          ref("channels/notifications/messages/videoPublished"),
          ref("channels/notifications/messages/yourVideoReady"),
        ],
      },
    },
    components: {
      messages: {
        VideoReady: {
          name: VIDEO_READY,
          title: "Video ready",
          summary: "A video finished transcoding and can be played",
          contentType: "application/json",
          headers: kafkaHeaders,
          payload: payload(videoReadyEventSchema),
          bindings: { kafka: { key: { type: "string", format: "uuid" }, bindingVersion: "0.5.0" } },
        },
        DeadLetter: {
          name: "dead-letter",
          title: "Dead letter",
          summary: "The original key, value and headers, plus why it failed",
          headers: {
            type: "object",
            properties: {
              "dlt-reason": { type: "string" },
              "dlt-source": {
                type: "string",
                description: "topic/partition@offset of the original",
              },
              "dlt-consumer": { type: "string", description: "Group that gave up on it" },
            },
          },
          payload: { type: "string", description: "The original value, possibly not even JSON" },
        },
        Auth: wsMessage("auth", clientAuthMessageSchema, "Browser -> server: sign this socket in"),
        AuthResult: wsMessage(
          "auth-result",
          authResultMessageSchema,
          "Server -> browser: whether it worked",
        ),
        VideoPublished: wsMessage(
          "video.published",
          videoPublishedMessageSchema,
          "A new video is up",
        ),
        YourVideoReady: wsMessage(
          "video.ready",
          yourVideoReadyMessageSchema,
          "Your upload is ready",
        ),
      },
    },
  };
}
