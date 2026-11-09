import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { ClientHub } from "./client-hub.js";
import { KafkaListener } from "./kafka-listener.js";
import { NotificationsGateway } from "./notifications.gateway.js";
import { Notifier } from "./notifier.js";
import { KeycloakTokenVerifier, TOKEN_VERIFIER } from "./token-verifier.js";

@Module({
  providers: [
    { provide: ClientHub, useValue: new ClientHub() },
    {
      provide: Notifier,
      inject: [ClientHub, APP_CONFIG],
      useFactory: (hub: ClientHub, config: AppConfig) =>
        new Notifier(hub, config.NOTIFY_MAX_EVENT_AGE_SECONDS * 1000),
    },
    {
      provide: TOKEN_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new KeycloakTokenVerifier(config.OIDC_ISSUER_URL, config.OIDC_AUDIENCE),
    },
    NotificationsGateway,
    KafkaListener,
  ],
  exports: [ClientHub],
})
export class NotifyModule {}
