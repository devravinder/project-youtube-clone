// Refuses destructive database commands unless DATABASE_URL is local.
import { existsSync } from "node:fs";

if (existsSync(".env.sample")) {
  process.loadEnvFile(".env.sample");
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { hostname, pathname } = new URL(url);
if (!LOCAL_HOSTS.has(hostname)) {
  console.error(`Refusing to run: database host "${hostname}" is not local.`);
  process.exit(1);
}
console.log(`Local database confirmed: ${hostname}${pathname}`);
