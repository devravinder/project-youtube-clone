import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { SwaggerModule } from "@nestjs/swagger";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";
import { buildOpenApiDocument } from "./openapi/openapi.js";
import { writeOpenApiFile } from "./openapi/openapi-file.js";

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
const config = app.get<AppConfig>(APP_CONFIG);
const document = buildOpenApiDocument(app);
SwaggerModule.setup("docs", app, document);
// Keeps contracts/ current while developing; deployed environments never write files.
if (config.APP_ENV !== "aws") {
  await writeOpenApiFile(document);
}

await app.listen(config.PORT);
