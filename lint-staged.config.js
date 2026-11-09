export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],
  "*.{json,yaml,yml,css}": ["prettier --write"],
  // Keep the OpenAPI contracts and web types in sync with API code.
  "apps/{upload,search}-service/src/**/*.ts": () => [
    "pnpm api:generate",
    "git add contracts apps/web/src/api",
  ],
  // Gradle formats the whole source set, so run once, not per file.
  "apps/transcoder-service/src/**/*.java": () => [
    "pnpm --filter @yt/transcoder-service format",
    "pnpm --filter @yt/transcoder-service test",
  ],
};
