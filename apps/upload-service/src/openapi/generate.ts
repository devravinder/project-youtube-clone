import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { buildOpenApiDocument } from "./openapi.js";
import { OPENAPI_FILE, writeOpenApiFile } from "./openapi-file.js";

// Preview mode builds the route table without instantiating providers,
// so no database, storage or Keycloak is needed.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const changed = await writeOpenApiFile(buildOpenApiDocument(app));
await app.close();
console.log(`${changed ? "Wrote" : "Unchanged"} ${OPENAPI_FILE}`);
