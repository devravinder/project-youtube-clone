import { Module } from "@nestjs/common";
import { SearchModule } from "../search/search.module.js";
import { KafkaIndexer } from "./kafka-indexer.js";

@Module({
  imports: [SearchModule],
  providers: [KafkaIndexer],
})
export class IndexerModule {}
