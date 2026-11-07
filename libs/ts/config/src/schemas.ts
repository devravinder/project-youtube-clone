import { z } from "zod";

// Reusable env schemas; services compose the ones they need.

export const baseEnv = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "local-observability", "aws"]).default("local"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export const postgresEnv = z.object({
  DATABASE_URL: z.string().url(),
});

export const minioEnv = z.object({
  STORAGE_ENDPOINT: z.string().url(),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),
  STORAGE_REGION: z.string().default("us-east-1"),
  STORAGE_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  STORAGE_RAW_BUCKET: z.string().default("raw-videos"),
  STORAGE_HLS_BUCKET: z.string().default("hls-videos"),
});

export const keycloakEnv = z.object({
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
});
