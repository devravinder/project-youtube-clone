import { z } from "zod";
import { VideoStatus } from "../generated/prisma/enums.js";

export const presignRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().regex(/^video\/[\w.+-]+$/, "contentType must be a video/* type"),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  })
  .meta({ id: "PresignRequest" });

export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const presignResponseSchema = z
  .object({
    videoId: z.uuid(),
    bucket: z.string(),
    key: z.string(),
    uploadUrl: z.url().describe("Presigned PUT URL; send the file bytes straight to storage"),
    expiresInSeconds: z.number().int(),
  })
  .meta({ id: "PresignResponse" });

export type PresignResponse = z.infer<typeof presignResponseSchema>;

export const confirmUploadResponseSchema = z
  .object({
    videoId: z.uuid(),
    status: z.enum(VideoStatus),
  })
  .meta({ id: "ConfirmUploadResponse" });

export type ConfirmUploadResponse = z.infer<typeof confirmUploadResponseSchema>;
