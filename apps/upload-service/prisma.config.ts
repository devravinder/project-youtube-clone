import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 skips .env; load the sample for CLI commands.
if (existsSync(".env.sample")) {
  process.loadEnvFile(".env.sample");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
