import { readFile, writeFile } from "node:fs/promises";
import { ASYNCAPI_FILE, renderAsyncApi } from "./asyncapi-file.js";

const content = renderAsyncApi();
const current = await readFile(ASYNCAPI_FILE, "utf8").catch(() => "");
if (current !== content) {
  await writeFile(ASYNCAPI_FILE, content);
}
console.log(`${current === content ? "Unchanged" : "Wrote"} ${ASYNCAPI_FILE}`);
