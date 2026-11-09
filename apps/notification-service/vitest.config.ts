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
      include: ["src/notify/**"],
      // Broker wiring only; covered by the end-to-end run, like the other services' adapters.
      exclude: ["src/**/*.spec.ts", "src/**/*.module.ts", "src/notify/kafka-listener.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
