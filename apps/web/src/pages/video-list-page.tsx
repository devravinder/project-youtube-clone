import { Link } from "react-router-dom";
import { VideoCard } from "../components/video-card";
import { Button } from "../components/ui";
import { useInView } from "../hooks/use-in-view";
import { useInfiniteVideos } from "../queries/videos";

export function VideoListPage() {
  const { data, error, status, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteVideos();

  const videos = data?.pages.flatMap((page) => page.items) ?? [];
  const sentinel = useInView<HTMLDivElement>(
    () => void fetchNextPage(),
    Boolean(hasNextPage) && !isFetchingNextPage,
    data?.pages.length,
  );

  if (status === "pending") {
    return <p className="text-muted-foreground">Loading videos...</p>;
  }
  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-destructive">Could not load videos: {error.message}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (videos.length === 0) {
    return (
      <p className="text-muted-foreground">
        No videos yet.{" "}
        <Link to="/upload" className="text-primary underline">
          Upload the first one.
        </Link>
      </p>
    );
  }

  return (
    <section aria-labelledby="videos-heading">
      <h1 id="videos-heading" className="mb-4 text-2xl font-semibold">
        Videos
      </h1>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video) => (
          <li key={video.id}>
            <VideoCard video={video} />
          </li>
        ))}
      </ul>
      <div
        ref={sentinel}
        className="py-8 text-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        {isFetchingNextPage && "Loading more..."}
        {!hasNextPage && !isFetchingNextPage && "You have reached the end."}
      </div>
    </section>
  );
}
