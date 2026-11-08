import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import {
  OPENAPI_FILE,
  TRANSCODE_COMMAND_FILE,
  writeOpenApiFile,
  writeTranscodeCommandFile,
} from "../contracts/contract-files.js";
import { buildOpenApiDocument } from "./openapi.js";

// Preview mode needs no database, storage, broker or Keycloak.
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
const openApiChanged = await writeOpenApiFile(buildOpenApiDocument(app));
await app.close();
const commandChanged = await writeTranscodeCommandFile();
console.log(`${openApiChanged ? "Wrote" : "Unchanged"} ${OPENAPI_FILE}`);
console.log(`${commandChanged ? "Wrote" : "Unchanged"} ${TRANSCODE_COMMAND_FILE}`);
