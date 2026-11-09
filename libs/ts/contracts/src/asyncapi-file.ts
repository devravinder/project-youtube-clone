import { resolve } from "node:path";
import { buildAsyncApiDocument } from "./asyncapi.js";

// Beside the OpenAPI specs: contracts/ holds every generated cross-service contract.
export const ASYNCAPI_FILE = resolve(import.meta.dirname, "../../../../contracts/asyncapi.json");

export const renderAsyncApi = () => `${JSON.stringify(buildAsyncApiDocument(), null, 2)}\n`;
