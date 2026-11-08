import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import {
  OPENAPI_FILE,
  writeMessageContractFiles,
  writeOpenApiFile,
} from "../contracts/contract-files.js";
import { buildOpenApiDocument } from "./openapi.js";

// Preview mode needs no database, storage, broker or Keycloak.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const openApiChanged = await writeOpenApiFile(buildOpenApiDocument(app));
await app.close();
const messagesChanged = await writeMessageContractFiles();
console.log(`${openApiChanged ? "Wrote" : "Unchanged"} ${OPENAPI_FILE}`);
console.log(`${messagesChanged ? "Wrote" : "Unchanged"} message schemas in contracts/`);
