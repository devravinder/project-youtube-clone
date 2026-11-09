import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { OPENAPI_FILE, writeOpenApiFile } from "../contracts/contract-files.js";
import { buildOpenApiDocument } from "./openapi.js";

// Preview mode needs no Kafka or Elasticsearch.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const changed = await writeOpenApiFile(buildOpenApiDocument(app));
await app.close();
console.log(`${changed ? "Wrote" : "Unchanged"} ${OPENAPI_FILE}`);
