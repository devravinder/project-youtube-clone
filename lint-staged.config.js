// Runs only on staged files. Keep fast: lint + format on change.
// Java services are formatted by Gradle spotless per-service (added with the transcoder).
export default {
  // TypeScript / JavaScript source — lint then format
  "*.{ts,tsx,js,jsx,mjs,cjs}": ["oxlint", "prettier --write"],

  // Markdown — lint (markdownlint) then format
  "*.md": ["markdownlint-cli2 --fix", "prettier --write"],

  // Other formattable files
  "*.{json,yaml,yml,css}": ["prettier --write"],
};
