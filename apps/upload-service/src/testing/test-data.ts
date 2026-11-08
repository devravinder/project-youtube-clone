import type { AppConfig } from "../config/app.config.js";

export const testConfig = {
  NODE_ENV: "test",
  APP_ENV: "local",
  PORT: 0,
  LOG_LEVEL: "error",
  DATABASE_URL: "postgresql://unused",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_REGION: "us-east-1",
  STORAGE_ACCESS_KEY: "test",
  STORAGE_SECRET_KEY: "test",
  STORAGE_FORCE_PATH_STYLE: true,
  STORAGE_RAW_BUCKET: "raw-videos",
  STORAGE_HLS_BUCKET: "hls-videos",
  OIDC_ISSUER_URL: "http://localhost:8180/realms/test",
  OIDC_AUDIENCE: "yt-api",
  UPLOAD_PENDING_TTL_MINUTES: 1440,
  UPLOAD_PART_SIZE_MB: 8,
  RABBITMQ_URL: "amqp://unused",
  OUTBOX_POLL_INTERVAL_MS: 1000,
  OUTBOX_RETENTION_HOURS: 72,
  HLS_PUBLIC_BASE_URL: "https://cdn.test/hls-videos",
} as unknown as AppConfig;

export const alice = { id: "user-alice", username: "alice" };
export const bob = { id: "user-bob", username: "bob" };
