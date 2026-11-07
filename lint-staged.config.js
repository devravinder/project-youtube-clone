// Java formatting runs via Gradle spotless per service.
export default {
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],
  "*.{json,yaml,yml,css}": ["prettier --write"],
  // Keeps the committed OpenAPI contract and web types in step with the API code.
  "apps/upload-service/src/**/*.ts": () => [
    "pnpm api:generate",
    "git add contracts apps/web/src/api",
  ],
};
