import { z } from "zod";

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^video\/[\w.+-]+$/, "contentType must be a video/* type"),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

export type PresignRequest = z.infer<typeof presignRequestSchema>;

export interface PresignResponse {
  readonly videoId: string;
  readonly bucket: string;
  readonly key: string;
  readonly uploadUrl: string;
  readonly expiresInSeconds: number;
}

export interface ConfirmUploadResponse {
  readonly videoId: string;
  readonly status: string;
}
