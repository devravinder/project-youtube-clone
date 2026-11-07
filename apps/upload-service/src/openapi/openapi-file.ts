import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { OpenAPIObject } from "@nestjs/swagger";

export const OPENAPI_FILE = resolve(
  import.meta.dirname,
  "../../../../contracts/upload-service.openapi.json",
);

// Writes only when the content changed, so watchers and file times stay quiet.
export async function writeOpenApiFile(document: OpenAPIObject): Promise<boolean> {
  const content = `${JSON.stringify(document, null, 2)}\n`;
  const current = await readFile(OPENAPI_FILE, "utf8").catch(() => "");
  if (current === content) {
    return false;
  }
  await mkdir(dirname(OPENAPI_FILE), { recursive: true });
  await writeFile(OPENAPI_FILE, content);
  return true;
}
