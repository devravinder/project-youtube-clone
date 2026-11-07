import { z } from "zod";

export const listVideosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
  cursor: z.uuid().optional(),
});

export type ListVideosQuery = z.infer<typeof listVideosQuerySchema>;

export interface VideoSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly viewCount: number;
  readonly createdAt: string;
}

export interface VideoPage {
  readonly items: VideoSummary[];
  // Pass back as `cursor` to fetch the next page; null on the last page.
  readonly nextCursor: string | null;
}

export interface VideoDetail extends VideoSummary {
  readonly contentType: string;
  // Null until the file has actually been uploaded.
  readonly playbackUrl: string | null;
}
