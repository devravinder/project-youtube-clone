import { Link } from "react-router-dom";
import { Badge, Card } from "../components/ui";
import { useAsync } from "../hooks/use-async";
import { listVideos } from "../services/api";

export function VideoListPage() {
  const { data, error, loading } = useAsync(listVideos, []);

  if (loading) {
    return <p className="text-muted-foreground">Loading videos...</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-destructive">
        Could not load videos: {error.message}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground">
        No videos yet.{" "}
        <Link to="/upload" className="underline">
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
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((video) => (
          <li key={video.id}>
            <Link to={`/watch/${video.id}`} className="block">
              <Card className="h-full transition hover:bg-muted">
                <h2 className="truncate font-medium">{video.title}</h2>
                {video.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {video.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <Badge>{video.status}</Badge>
                  <span>{new Date(video.createdAt).toLocaleString()}</span>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
