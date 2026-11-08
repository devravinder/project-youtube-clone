import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { SwaggerModule } from "@nestjs/swagger";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";
import { writeMessageContractFiles, writeOpenApiFile } from "./contracts/contract-files.js";
import { buildOpenApiDocument } from "./openapi/openapi.js";

const app = await NestFactory.create(AppModule);
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
