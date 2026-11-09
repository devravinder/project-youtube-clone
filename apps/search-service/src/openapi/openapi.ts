import type { INestApplication } from "@nestjs/common";
import { ApiResponse, DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";
import "../search/search.dto.js";

type Schemas = NonNullable<OpenAPIObject["components"]>["schemas"];

export const errorResponseSchema = z
  .object({
    statusCode: z.number().int(),
    error: z.string(),
    message: z.union([z.string(), z.array(z.unknown())]),
  })
  .meta({ id: "ErrorResponse", description: "Error body returned by every failing request" });

export const ApiJsonResponse = (status: number, description: string, schemaName: string) =>
  ApiResponse({ status, description, schema: { $ref: `#/components/schemas/${schemaName}` } });

export const ApiErrorResponse = (status: number, description: string) =>
  ApiJsonResponse(status, description, "ErrorResponse");

// Named Zod schemas become components, so spec and validation stay in sync.
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
    .setTitle("Search Service")
    .setDescription("Full-text search and autocomplete over ready videos (Elasticsearch)")
    .setVersion("1.0.0")
    .setOpenAPIVersion("3.1.0")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components = { ...document.components, schemas: componentSchemas() };
  return document;
}
