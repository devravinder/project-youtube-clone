import { Controller, Get, Module } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { AppConfigModule } from "./config/app.config.js";
import { IndexerModule } from "./indexer/indexer.module.js";
import { SearchModule } from "./search/search.module.js";

@ApiExcludeController()
@Controller("health")
class HealthController {
  @Get()
  health(): { status: "ok" } {
    return { status: "ok" };
  }
}

@Module({
  imports: [AppConfigModule, SearchModule, IndexerModule],
  controllers: [HealthController],
})
export class AppModule {}
