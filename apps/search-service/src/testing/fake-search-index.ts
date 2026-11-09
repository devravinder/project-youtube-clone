import type {
  SearchQuery,
  SearchResult,
  SuggestQuery,
  SuggestResult,
} from "../search/search.dto.js";
import type { SearchIndexPort, UpsertResult, VideoDocument } from "../search/search-index.port.js";

// Keeps the highest version per id, like external versioning in Elasticsearch.
export class FakeSearchIndex implements SearchIndexPort {
  readonly docs = new Map<string, { version: number; document: VideoDocument }>();
  readonly searches: SearchQuery[] = [];
  readonly suggests: SuggestQuery[] = [];
  failWith: Error | null = null;
  ensured = 0;

  async ensureIndex(): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.ensured++;
  }

  async upsert(id: string, version: number, document: VideoDocument): Promise<UpsertResult> {
    if (this.failWith) throw this.failWith;
    const current = this.docs.get(id);
    if (current && current.version >= version) return "stale";
    this.docs.set(id, { version, document });
    return "written";
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    this.searches.push(query);
    const items = [...this.docs]
      .filter(([, d]) => d.document.title.toLowerCase().includes(query.q.toLowerCase()))
      .map(([id, { document }]) => ({
        id,
        title: document.title,
        description: document.description,
        renditions: document.renditions,
        createdAt: document.createdAt,
      }));
    return { total: items.length, items: items.slice(query.offset, query.offset + query.limit) };
  }

  async suggest(query: SuggestQuery): Promise<SuggestResult> {
    this.suggests.push(query);
    const items = [...this.docs]
      .filter(([, d]) => d.document.title.toLowerCase().startsWith(query.q.toLowerCase()))
      .map(([id, { document }]) => ({ id, title: document.title }));
    return { items: items.slice(0, query.limit) };
  }
}
