import { Module } from "@nestjs/common";
import { APP_CONFIG, type AppConfig } from "../config/app.config.js";
import { ElasticsearchIndex } from "./elasticsearch-index.adapter.js";
import { SearchController } from "./search.controller.js";
import { SEARCH_INDEX_PORT } from "./search-index.port.js";

@Module({
  controllers: [SearchController],
  providers: [
    {
      provide: SEARCH_INDEX_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        ElasticsearchIndex.connect(config.ELASTICSEARCH_URL, config.SEARCH_INDEX),
    },
  ],
  exports: [SEARCH_INDEX_PORT],
})
export class SearchModule {}
