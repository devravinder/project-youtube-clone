import createClient from "openapi-fetch";
import type { paths } from "../api/search-schema";
import { config } from "../config";
import { bodyOf, throwOnError } from "./api";

// Public and read-only, so no token is sent.
const client = createClient<paths>({
  baseUrl: config.searchBaseUrl,
  fetch: (request) => globalThis.fetch(request),
});
client.use(throwOnError);

export const searchVideos = async (params: { q: string; limit?: number; offset?: number }) =>
  bodyOf(await client.GET("/search", { params: { query: params } }));

export const suggestVideos = async (q: string, signal?: AbortSignal) =>
  bodyOf(await client.GET("/search/suggest", { params: { query: { q } }, signal }));
