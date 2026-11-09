import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WsAdapter } from "@nestjs/platform-ws";
import { AppModule } from "./app.module.js";
import { APP_CONFIG, type AppConfig } from "./config/app.config.js";

const app = await NestFactory.create(AppModule);
// Plain WebSocket (ws), not socket.io: the browser's built-in WebSocket is the client.
app.useWebSocketAdapter(new WsAdapter(app));
app.enableShutdownHooks();
await app.listen(app.get<AppConfig>(APP_CONFIG).PORT);
