import { readFile } from "node:fs/promises";
import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { buildOpenApiDocument } from "./openapi.js";
import { OPENAPI_FILE } from "./openapi-file.js";

describe("OpenAPI contract", () => {
  it("matches the committed contracts/upload-service.openapi.json", async () => {
    const app = await NestFactory.create(AppModule, { preview: true, logger: false });
    const generated = JSON.parse(JSON.stringify(buildOpenApiDocument(app)));
    await app.close();

    const committed = JSON.parse(await readFile(OPENAPI_FILE, "utf8"));

    expect(generated).toEqual(committed);
  });

  it("documents every operation with an id and an error response", async () => {
    const committed = JSON.parse(await readFile(OPENAPI_FILE, "utf8"));
    const operations = Object.values(committed.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string; responses: object }>),
    );

    expect(operations.length).toBeGreaterThanOrEqual(8);
    for (const operation of operations) {
      expect(operation.operationId).toMatch(/^[a-z][A-Za-z]+$/);
      expect(Object.keys(operation.responses).some((status) => status.startsWith("4"))).toBe(true);
    }
  });
});
