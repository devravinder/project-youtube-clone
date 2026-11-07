import { z } from "zod";
import { VideoStatus } from "../generated/prisma/enums.js";

export const listVideosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.uuid().optional(),
});

export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;

export const videoSummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(VideoStatus),
    viewCount: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "VideoSummary" });

export type VideoSummary = z.infer<typeof videoSummarySchema>;

export const videoPageSchema = z
  .object({
    items: z.array(videoSummarySchema),
    nextCursor: z
      .uuid()
      .nullable()
      .describe("Pass back as `cursor` to fetch the next page; null on the last page"),
  })
  .meta({ id: "VideoPage" });

export type VideoPage = z.infer<typeof videoPageSchema>;

export const videoDetailSchema = videoSummarySchema
  .extend({
    contentType: z.string(),
    playbackUrl: z.url().nullable().describe("Null until the file has actually been uploaded"),
  })
  .meta({ id: "VideoDetail" });

export type VideoDetail = z.infer<typeof videoDetailSchema>;
