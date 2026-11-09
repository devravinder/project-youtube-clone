import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { OtelConsoleLogger, telemetryEnabled } from "@yt/telemetry";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";
import { writeOpenApiFile } from "./contracts/contract-files.js";
import { buildOpenApiDocument } from "./openapi/openapi.js";

// Logs go to Loki too (with the trace id) when telemetry is on.
const app = await NestFactory.create(
  AppModule,
  telemetryEnabled() ? { logger: new OtelConsoleLogger() } : {},
);
app.enableShutdownHooks();
const config = app.get<AppConfig>(APP_CONFIG);
const document = buildOpenApiDocument(app);
SwaggerModule.setup("docs", app, document);
// Keep contracts/ current while developing; images are read-only and run with NODE_ENV=production.
if (config.APP_ENV !== "aws" && config.NODE_ENV !== "production") {
  await writeOpenApiFile(document);
}

await app.listen(config.PORT);
