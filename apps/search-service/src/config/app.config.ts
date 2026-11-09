import { Global, Module } from "@nestjs/common";
import { baseEnv, kafkaEnv, loadConfig } from "@yt/config";
import { z } from "zod";

const schema = z.object({
  ...baseEnv.shape,
  ...kafkaEnv.shape,
  // One group = one copy of the work; a new group id re-reads the topic from the start.
  KAFKA_GROUP_ID: z.string().min(1).default("search-service"),
  ELASTICSEARCH_URL: z.url().default("http://localhost:9200"),
  // An alias: the real index is "<alias>-v1", so a new mapping can be built beside it.
  SEARCH_INDEX: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default("videos"),
});

export type AppConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(schema) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
