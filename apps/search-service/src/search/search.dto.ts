import { z } from "zod";

// Deep from/size paging is expensive in Elasticsearch, so offset is capped.
export const MAX_OFFSET = 1000;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type SuggestQuery = z.infer<typeof suggestQuerySchema>;

export const searchHitSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    description: z.string().nullable(),
    renditions: z.array(z.string()).describe("Rendition names, highest first"),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "SearchHit" });
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResultSchema = z
  .object({
    total: z.number().int().describe("Matching videos, not just this page"),
    items: z.array(searchHitSchema),
  })
  .meta({ id: "SearchResult" });
export type SearchResult = z.infer<typeof searchResultSchema>;

export const suggestionSchema = z
  .object({ id: z.uuid(), title: z.string() })
  .meta({ id: "Suggestion" });
export type Suggestion = z.infer<typeof suggestionSchema>;

export const suggestResultSchema = z
  .object({ items: z.array(suggestionSchema) })
  .meta({ id: "SuggestResult" });
export type SuggestResult = z.infer<typeof suggestResultSchema>;
