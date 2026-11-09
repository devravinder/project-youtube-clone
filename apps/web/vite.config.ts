import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.API_PROXY_TARGET;
  if (command === "serve" && !apiTarget) {
    throw new Error("Missing API_PROXY_TARGET. Set it in apps/web/.env.development");
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        // WebSocket upgrade to the notification service.
        ...(env.NOTIFICATIONS_PROXY_TARGET && {
          "/ws": { target: env.NOTIFICATIONS_PROXY_TARGET, ws: true, changeOrigin: true },
        }),
        ...(env.SEARCH_PROXY_TARGET && {
          "/search-api": {
            target: env.SEARCH_PROXY_TARGET,
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/search-api/, ""),
          },
        }),
      },
    },
  };
});
