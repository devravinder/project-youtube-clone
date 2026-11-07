import { z } from "zod";
import { presignRequestSchema } from "./presign.dto.js";

const MAX_FILE_BYTES = 5 * 1024 ** 4;
export const MAX_PARTS = 10_000;
const MAX_URLS_PER_REQUEST = 100;

export const multipartInitRequestSchema = presignRequestSchema
  .extend({
    fileSize: z.number().int().positive().max(MAX_FILE_BYTES).describe("File size in bytes"),
  })
  .meta({ id: "MultipartInitRequest" });

export type MultipartInitRequest = z.infer<typeof multipartInitRequestSchema>;

export const multipartInitResponseSchema = z
  .object({
    videoId: z.uuid(),
    partSize: z.number().int().describe("Bytes per part; the last part may be smaller"),
    partCount: z.number().int(),
  })
  .meta({ id: "MultipartInitResponse" });

export type MultipartInitResponse = z.infer<typeof multipartInitResponseSchema>;

export const partUrlsRequestSchema = z
  .object({
    partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(MAX_URLS_PER_REQUEST),
  })
  .meta({ id: "PartUrlsRequest" });

export type PartUrlsRequest = z.infer<typeof partUrlsRequestSchema>;

export const partUrlsResponseSchema = z
  .object({
    urls: z.array(z.object({ partNumber: z.number().int(), url: z.url() })),
    expiresInSeconds: z.number().int(),
  })
  .meta({ id: "PartUrlsResponse" });

export type PartUrlsResponse = z.infer<typeof partUrlsResponseSchema>;

export const uploadedPartsResponseSchema = z
  .object({
    partSize: z.number().int(),
    partCount: z.number().int(),
    uploadedParts: z.array(z.object({ partNumber: z.number().int(), size: z.number().int() })),
  })
  .meta({ id: "UploadedPartsResponse" });

export type UploadedPartsResponse = z.infer<typeof uploadedPartsResponseSchema>;
