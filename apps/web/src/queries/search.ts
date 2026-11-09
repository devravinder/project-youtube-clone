import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { searchVideos, suggestVideos } from "../services/search";

export const SEARCH_PAGE_SIZE = 12;
export const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_STALE_MS = 30_000;

export const searchKeys = {
  all: ["search"] as const,
  results: (q: string) => [...searchKeys.all, "results", q] as const,
  suggest: (q: string) => [...searchKeys.all, "suggest", q] as const,
};

export function useSearchResults(q: string) {
  return useInfiniteQuery({
    queryKey: searchKeys.results(q),
    queryFn: ({ pageParam }) => searchVideos({ q, limit: SEARCH_PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled: q.length > 0,
  });
}

export function useSuggestions(input: string) {
  const q = useDebouncedValue(input.trim(), SUGGEST_DEBOUNCE_MS);
  return useQuery({
    queryKey: searchKeys.suggest(q),
    // The signal cancels a request whose answer nobody waits for any more.
    queryFn: ({ signal }) => suggestVideos(q, signal),
    enabled: q.length > 0,
    staleTime: SUGGEST_STALE_MS,
    // Keeps the old list on screen while the next one loads, instead of flickering empty.
    placeholderData: keepPreviousData,
  });
}
