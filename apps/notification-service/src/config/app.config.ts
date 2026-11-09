import { Global, Module } from "@nestjs/common";
import { baseEnv, kafkaEnv, keycloakEnv, loadConfig } from "@yt/config";
import { z } from "zod";

const schema = z.object({
  ...baseEnv.shape,
  ...kafkaEnv.shape,
  ...keycloakEnv.shape,
  // Each instance gets "<prefix>-<random>": every instance must see every event for its own sockets.
  KAFKA_GROUP_PREFIX: z.string().min(1).default("notification-service"),
  // A "new video" toast about something from an hour ago is noise.
  NOTIFY_MAX_EVENT_AGE_SECONDS: z.coerce.number().int().positive().default(600),
});

export type AppConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(schema) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
