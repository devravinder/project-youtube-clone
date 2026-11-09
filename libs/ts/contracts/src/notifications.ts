import { z } from "zod";

// WebSocket between notification-service and the browser; Nest's { event, data } shape both ways.
export const NOTIFICATIONS_PATH = "/ws";

const videoRef = z.object({ videoId: z.uuid(), title: z.string() });

export const clientAuthMessageSchema = z
  .object({ event: z.literal("auth"), data: z.object({ token: z.string().min(1) }) })
  .meta({
    title: "AuthMessage",
    description: "Sent by the browser after connecting; tokens never go in the URL",
  });

export const authResultMessageSchema = z
  .object({
    event: z.literal("auth"),
    data: z.object({ ok: z.boolean(), userId: z.string().nullable() }),
  })
  .meta({ title: "AuthResult", description: "Reply to an auth message" });

export const videoPublishedMessageSchema = z
  .object({ event: z.literal("video.published"), data: videoRef })
  .meta({
    title: "VideoPublished",
    description: "To everyone except the uploader: a new video is up",
  });

export const yourVideoReadyMessageSchema = z
  .object({ event: z.literal("video.ready"), data: videoRef })
  .meta({ title: "YourVideoReady", description: "To the uploader's signed-in sockets only" });

export const serverMessageSchema = z.discriminatedUnion("event", [
  authResultMessageSchema,
  videoPublishedMessageSchema,
  yourVideoReadyMessageSchema,
]);

export type ClientAuthMessage = z.infer<typeof clientAuthMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
