import ReactPlayer from "react-player";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../components/ui";
import { useAsync } from "../hooks/use-async";
import { ApiError, getVideo } from "../services/api";

export function WatchPage() {
  const { id = "" } = useParams();
  const { data: video, error, loading } = useAsync(() => getVideo(id), [id]);

  if (loading) {
    return <p className="text-muted-foreground">Loading video...</p>;
  }
  if (error) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <p role="alert" className="text-destructive">
        {missing ? "Video not found." : `Could not load video: ${error.message}`}{" "}
        <Link to="/" className="underline">
          Back to videos
        </Link>
      </p>
    );
  }
  if (!video) {
    return null;
  }

  return (
    <article className="mx-auto max-w-4xl">
      {video.playbackUrl ? (
        <div className="aspect-video overflow-hidden rounded-md bg-black">
          <ReactPlayer
            src={video.playbackUrl}
            controls
            width="100%"
            height="100%"
            title={video.title}
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
          The file has not been uploaded yet.
        </div>
      )}
      <h1 className="mt-4 text-2xl font-semibold">{video.title}</h1>
      <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
        <Badge>{video.status}</Badge>
        <span>{video.viewCount} views</span>
        <span>{new Date(video.createdAt).toLocaleString()}</span>
      </div>
      {video.description && <p className="mt-4 whitespace-pre-line">{video.description}</p>}
    </article>
  );
}
