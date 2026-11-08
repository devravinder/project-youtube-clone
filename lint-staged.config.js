// Java formatting runs via Gradle spotless per service.
export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],
  "*.{json,yaml,yml,css}": ["prettier --write"],
  // Keep the OpenAPI contract and web types in sync with API code.
  "apps/upload-service/src/**/*.ts": () => [
    "pnpm api:generate",
    "git add contracts apps/web/src/api",
  ],
};
