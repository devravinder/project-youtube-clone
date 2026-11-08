import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { buildOpenApiDocument } from "./openapi.js";
import { OPENAPI_FILE, writeOpenApiFile } from "./openapi-file.js";

// Preview mode needs no database, storage or Keycloak.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const changed = await writeOpenApiFile(buildOpenApiDocument(app));
await app.close();
console.log(`${changed ? "Wrote" : "Unchanged"} ${OPENAPI_FILE}`);
