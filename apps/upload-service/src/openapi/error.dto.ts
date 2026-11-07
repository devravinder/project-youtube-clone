import { z } from "zod";

export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    error: z.string(),
    message: z.union([z.string(), z.array(z.unknown())]),
  })
  .meta({ id: "ErrorResponse", description: "Error body returned by every failing request" });
