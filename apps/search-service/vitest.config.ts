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
      include: ["src/search/**", "src/indexer/**"],
      // Broker wiring only; covered by the end-to-end run, like upload-service's adapters.
      exclude: ["src/**/*.spec.ts", "src/**/*.module.ts", "src/indexer/kafka-indexer.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
