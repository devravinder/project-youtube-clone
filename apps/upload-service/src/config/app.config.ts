import { Global, Module } from "@nestjs/common";
import { baseEnv, loadConfig, minioEnv, postgresEnv } from "@yt/config";
import { z } from "zod";

const schema = z.object({ ...baseEnv.shape, ...minioEnv.shape, ...postgresEnv.shape });

export type AppConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(schema) }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
