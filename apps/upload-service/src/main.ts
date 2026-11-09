import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { OtelConsoleLogger, telemetryEnabled } from "@yt/telemetry";
import { AppModule } from "./app.module.js";
import { SwaggerModule } from "@nestjs/swagger";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";
import { writeMessageContractFiles, writeOpenApiFile } from "./contracts/contract-files.js";
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
// Keep contracts/ current in development.
if (config.APP_ENV !== "aws") {
  await writeOpenApiFile(document);
  await writeMessageContractFiles();
}

await app.listen(config.PORT);
