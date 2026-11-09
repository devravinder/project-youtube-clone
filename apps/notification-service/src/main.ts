import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { OtelConsoleLogger, telemetryEnabled } from "@yt/telemetry";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module.js";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";

// Logs go to Loki too (with the trace id) when telemetry is on.
const app = await NestFactory.create(
  AppModule,
  telemetryEnabled() ? { logger: new OtelConsoleLogger() } : {},
);
// Plain WebSocket (ws), not socket.io: the browser's built-in WebSocket is the client.
app.useWebSocketAdapter(new WsAdapter(app));
app.enableShutdownHooks();
await app.listen(app.get<AppConfig>(APP_CONFIG).PORT);
