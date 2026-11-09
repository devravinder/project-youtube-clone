import type { SearchQuery, SearchResult, SuggestQuery, SuggestResult } from "./search.dto.js";

export interface VideoDocument {
  title: string;
  description: string | null;
  ownerId: string | null;
  renditions: string[];
  createdAt: string;
  readyAt: string;
}

export type UpsertResult = "written" | "stale";

export interface SearchIndexPort {
  ensureIndex(): Promise<void>;
  // "stale" when the index already has this or a newer version of the video.
  upsert(id: string, version: number, document: VideoDocument): Promise<UpsertResult>;
  search(query: SearchQuery): Promise<SearchResult>;
  suggest(query: SuggestQuery): Promise<SuggestResult>;
}

export const SEARCH_INDEX_PORT = Symbol("SEARCH_INDEX_PORT");
