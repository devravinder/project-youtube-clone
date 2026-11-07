import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import "./error.dto.js";
import "../uploads/presign.dto.js";
import "../videos/video.dto.js";

type Schemas = NonNullable<OpenAPIObject["components"]>["schemas"];

// Every schema tagged with `.meta({ id })` becomes a named component, so the
// validation schemas and the published contract can never drift apart.
function componentSchemas(): Schemas {
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    target: "draft-2020-12",
    uri: (id) => `#/components/schemas/${id}`,
  });
  for (const schema of Object.values(schemas)) {
    delete (schema as Record<string, unknown>)["$schema"];
    delete (schema as Record<string, unknown>)["$id"];
  }
  return schemas as Schemas;
}

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Upload Service")
    .setDescription("Creates videos, issues presigned upload URLs and serves video metadata")
    .setVersion("1.0.0")
    .setOpenAPIVersion("3.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components = { ...document.components, schemas: componentSchemas() };
  return document;
}
