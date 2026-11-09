import { Play } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Highlight } from "../components/highlight";
import { Button } from "../components/ui";
import { useInView } from "../hooks/use-in-view";
import { useSearchResults } from "../queries/search";

export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const { data, error, status, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSearchResults(q);
  const hits = data?.pages.flatMap((page) => page.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;
  const sentinel = useInView<HTMLDivElement>(
    () => void fetchNextPage(),
    Boolean(hasNextPage) && !isFetchingNextPage,
    data?.pages.length,
  );

  if (!q) {
    return <p className="text-muted-foreground">Type something in the search box.</p>;
  }
  if (status === "pending") {
    return <p className="text-muted-foreground">Searching...</p>;
  }
  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-destructive">Search is unavailable: {error.message}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="search-heading">
      <h1 id="search-heading" className="mb-1 text-3xl font-bold text-primary">
        Results for “{q}”
      </h1>
      <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
        {total === 0 ? "No videos match." : `${total} video${total === 1 ? "" : "s"}`}
      </p>
      <ul className="flex flex-col gap-3">
        {hits.map((hit) => (
          <li key={hit.id}>
            <Link
              to={`/watch/${hit.id}`}
              className="group flex gap-4 rounded-md border border-border bg-card p-3 transition hover:border-primary"
            >
              <div className="flex aspect-video w-40 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                <Play className="size-8 transition group-hover:scale-110" fill="currentColor" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-primary">
                  <Highlight text={hit.title} query={q} />
                </h2>
                {hit.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    <Highlight text={hit.description} query={q} />
                  </p>
                )}
                <p className="mt-2 flex gap-3 text-xs text-muted-foreground">
                  {hit.renditions[0] && <span>Up to {hit.renditions[0]}</span>}
                  <time dateTime={hit.createdAt}>
                    {new Date(hit.createdAt).toLocaleDateString()}
                  </time>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="py-6 text-center text-sm text-muted-foreground">
        {isFetchingNextPage && "Loading more..."}
      </div>
    </section>
  );
}
