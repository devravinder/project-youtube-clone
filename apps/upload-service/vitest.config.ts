import { defineConfig } from "vitest/config";

export default defineConfig({
  // Nest needs legacy decorators.
  oxc: { decorator: { legacy: true } },
  test: {
    environment: "node",
    setupFiles: ["src/testing/setup.ts"],
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/uploads/**", "src/videos/**", "src/cleanup/**", "src/auth/**"],
      exclude: ["src/**/*.spec.ts", "src/**/*.dto.ts", "src/**/*.module.ts", "src/generated/**"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
