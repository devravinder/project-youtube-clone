import { Inject, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import { clientAuthMessageSchema, NOTIFICATIONS_PATH } from "@yt/contracts";
import type { WebSocket } from "ws";
import { ClientHub } from "./client-hub.js";
import { TOKEN_VERIFIER, type TokenVerifier } from "./token-verifier.js";

// Below the usual 60 s idle timeout of proxies and load balancers.
export const HEARTBEAT_INTERVAL_MS = 30_000;

@WebSocketGateway({ path: NOTIFICATIONS_PATH })
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ClientHub) private readonly hub: ClientHub,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => this.hub.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Anonymous until an auth message arrives; anonymous sockets still get public notifications.
  handleConnection(socket: WebSocket): void {
    this.hub.add(socket);
    socket.on("pong", () => this.hub.markAlive(socket));
  }

  handleDisconnect(socket: WebSocket): void {
    this.hub.remove(socket);
  }

  @SubscribeMessage("auth")
  async auth(@ConnectedSocket() socket: WebSocket, @MessageBody() data: unknown): Promise<void> {
    const parsed = clientAuthMessageSchema.shape.data.safeParse(data);
    const userId = parsed.success ? await this.verifier.verify(parsed.data.token) : null;
    if (userId) {
      this.hub.identify(socket, userId);
    }
    this.hub.send(socket, { event: "auth", data: { ok: userId !== null, userId } });
  }
}
