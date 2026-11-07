import { ApiResponse } from "@nestjs/swagger";

export const schemaRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const ApiJsonResponse = (status: number, description: string, schemaName: string) =>
  ApiResponse({ status, description, schema: schemaRef(schemaName) });

export const ApiErrorResponse = (status: number, description: string) =>
  ApiJsonResponse(status, description, "ErrorResponse");
