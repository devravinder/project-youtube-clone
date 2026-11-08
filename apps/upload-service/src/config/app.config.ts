import { Global, Module } from "@nestjs/common";
import { baseEnv, keycloakEnv, loadConfig, minioEnv, postgresEnv, rabbitmqEnv } from "@yt/config";
import { z } from "zod";

const schema = z.object({
  ...baseEnv.shape,
  ...minioEnv.shape,
  ...postgresEnv.shape,
  ...keycloakEnv.shape,
  ...rabbitmqEnv.shape,
  UPLOAD_PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  // Storage rejects smaller parts, except the last.
  UPLOAD_PART_SIZE_MB: z.coerce.number().int().min(5).default(8),
});

export type AppConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(schema) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
