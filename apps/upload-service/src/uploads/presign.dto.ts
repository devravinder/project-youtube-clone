import { z } from "zod";

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^video\/[\w.+-]+$/, "contentType must be a video/* type"),
});

export type PresignRequest = z.infer<typeof presignRequestSchema>;

export interface PresignResponse {
  readonly videoId: string;
  readonly bucket: string;
  readonly key: string;
  readonly uploadUrl: string;
  readonly expiresInSeconds: number;
}
