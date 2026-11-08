import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { OpenAPIObject } from "@nestjs/swagger";
import { transcodeCommandJsonSchema } from "../messaging/transcode-command.js";
import { videoStatusEventJsonSchema } from "../messaging/video-status-event.js";

const CONTRACTS_DIR = resolve(import.meta.dirname, "../../../../contracts");
export const OPENAPI_FILE = resolve(CONTRACTS_DIR, "upload-service.openapi.json");
export const TRANSCODE_COMMAND_FILE = resolve(CONTRACTS_DIR, "transcode-command.schema.json");
export const VIDEO_STATUS_FILE = resolve(CONTRACTS_DIR, "video-status.schema.json");

export function writeOpenApiFile(document: OpenAPIObject): Promise<boolean> {
  return writeJsonFile(OPENAPI_FILE, document);
}

// Message schemas; returns true when either file changed.
export async function writeMessageContractFiles(): Promise<boolean> {
  const command = await writeJsonFile(TRANSCODE_COMMAND_FILE, transcodeCommandJsonSchema());
  const status = await writeJsonFile(VIDEO_STATUS_FILE, videoStatusEventJsonSchema());
  return command || status;
}

// Skips the write when nothing changed.
async function writeJsonFile(file: string, value: unknown): Promise<boolean> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const current = await readFile(file, "utf8").catch(() => "");
  if (current === content) {
    return false;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  return true;
}
