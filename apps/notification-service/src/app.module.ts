import { Controller, Get, Inject, Module } from "@nestjs/common";
import { AppConfigModule } from "./config/app.config.js";
import { ClientHub } from "./notify/client-hub.js";
import { NotifyModule } from "./notify/notify.module.js";

@Controller("health")
class HealthController {
  constructor(@Inject(ClientHub) private readonly hub: ClientHub) {}

  @Get()
  health(): { status: "ok"; clients: number } {
    return { status: "ok", clients: this.hub.size };
  }
}

@Module({
  imports: [AppConfigModule, NotifyModule],
  controllers: [HealthController],
})
export class AppModule {}
