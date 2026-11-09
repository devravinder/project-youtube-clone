import type { OnApplicationShutdown } from "@nestjs/common";
import { Client, errors } from "@elastic/elasticsearch";
import type { estypes } from "@elastic/elasticsearch";
import type { SearchQuery, SearchResult, SuggestQuery, SuggestResult } from "./search.dto.js";
import type { SearchIndexPort, UpsertResult, VideoDocument } from "./search-index.port.js";

const SUGGEST_FIELDS = ["title.suggest", "title.suggest._2gram", "title.suggest._3gram"];

export const indexName = (alias: string) => `${alias}-v1`;

// strict: a field the mapping does not know is an error, not a silently guessed type.
export const INDEX_MAPPINGS: estypes.MappingTypeMapping = {
  dynamic: "strict",
  properties: {
    title: {
      type: "text",
      // search_as_you_type adds 2- and 3-word shingles and edge n-grams for prefix matching.
      fields: { suggest: { type: "search_as_you_type" } },
    },
    description: { type: "text" },
    ownerId: { type: "keyword" },
    renditions: { type: "keyword" },
    createdAt: { type: "date" },
    readyAt: { type: "date" },
  },
};

// Title hits weigh 3x; fuzziness forgives typos; bool_prefix lets the last word be partial.
export function buildSearchRequest(index: string, q: SearchQuery): estypes.SearchRequest {
  return {
    index,
    from: q.offset,
    size: q.limit,
    track_total_hits: true,
    query: {
      bool: {
        should: [
          { multi_match: { query: q.q, fields: ["title^3", "description"], fuzziness: "AUTO" } },
          { multi_match: { query: q.q, type: "bool_prefix", fields: SUGGEST_FIELDS } },
        ],
        minimum_should_match: 1,
      },
    },
    sort: ["_score", { createdAt: { order: "desc" } }],
    _source: ["title", "description", "renditions", "createdAt"],
  };
}

export function buildSuggestRequest(index: string, q: SuggestQuery): estypes.SearchRequest {
  return {
    index,
    size: q.limit,
    query: { multi_match: { query: q.q, type: "bool_prefix", fields: SUGGEST_FIELDS } },
    _source: ["title"],
  };
}

export class ElasticsearchIndex implements SearchIndexPort, OnApplicationShutdown {
  constructor(
    private readonly alias: string,
    private readonly client: Client,
  ) {}

  static connect(url: string, alias: string): ElasticsearchIndex {
    return new ElasticsearchIndex(alias, new Client({ node: url, requestTimeout: 10_000 }));
  }

  async ensureIndex(): Promise<void> {
    if (await this.client.indices.existsAlias({ name: this.alias })) {
      return;
    }
    try {
      await this.client.indices.create({
        index: indexName(this.alias),
        // One node locally; replicas would never be assigned and the index would stay yellow.
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: INDEX_MAPPINGS,
        aliases: { [this.alias]: {} },
      });
    } catch (error) {
      // Another replica created it first.
      if (!isIndexExists(error)) throw error;
    }
  }

  async upsert(id: string, version: number, document: VideoDocument): Promise<UpsertResult> {
    try {
      // External versioning: an older or repeated event cannot overwrite a newer document.
      await this.client.index({
        index: this.alias,
        id,
        version,
        version_type: "external",
        document,
      });
      return "written";
    } catch (error) {
      if (error instanceof errors.ResponseError && error.statusCode === 409) {
        return "stale";
      }
      throw error;
    }
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const response = await this.client.search<VideoDocument>(buildSearchRequest(this.alias, query));
    const total = response.hits.total;
    return {
      total: typeof total === "number" ? total : (total?.value ?? 0),
      items: response.hits.hits.map((hit) => ({
        id: hit._id as string,
        title: hit._source?.title ?? "",
        description: hit._source?.description ?? null,
        renditions: hit._source?.renditions ?? [],
        createdAt: hit._source?.createdAt ?? "",
      })),
    };
  }

  async suggest(query: SuggestQuery): Promise<SuggestResult> {
    const response = await this.client.search<Pick<VideoDocument, "title">>(
      buildSuggestRequest(this.alias, query),
    );
    return {
      items: response.hits.hits.map((hit) => ({
        id: hit._id as string,
        title: hit._source?.title ?? "",
      })),
    };
  }

  onApplicationShutdown(): Promise<void> {
    return this.client.close();
  }
}

const isIndexExists = (error: unknown) =>
  error instanceof errors.ResponseError &&
  JSON.stringify(error.body ?? "").includes("resource_already_exists_exception");
