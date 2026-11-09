import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: no dev proxy needed.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    env: {
      // Node's Request needs an absolute URL.
      VITE_API_BASE_URL: "http://api.test/api",
      VITE_OIDC_AUTHORITY: "http://localhost:8180/realms/test",
      VITE_OIDC_CLIENT_ID: "yt-web",
      VITE_NOTIFICATIONS_PATH: "/ws",
    },
    coverage: {
      provider: "v8",
      include: [
        "src/services/**",
        "src/auth/**",
        "src/config.ts",
        "src/hooks/use-notifications.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/api/**"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
