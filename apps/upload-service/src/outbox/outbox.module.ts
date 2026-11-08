import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { OutboxRelay } from "./outbox.relay.js";
import { OUTBOX_STORE, PrismaOutboxStore } from "./outbox.store.js";

@Module({
  imports: [PrismaModule, MessagingModule],
  providers: [{ provide: OUTBOX_STORE, useClass: PrismaOutboxStore }, OutboxRelay],
})
export class OutboxModule {}
