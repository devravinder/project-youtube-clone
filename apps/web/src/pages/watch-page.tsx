import ReactPlayer from "react-player";
import { useParams } from "react-router-dom";
import { BackButton } from "../components/back-button";
import { StatusBadge } from "../components/status-badge";
import { useVideo } from "../queries/videos";
import { ApiError } from "../services/api";

export function WatchPage() {
  const { id = "" } = useParams();
  const { data: video, error, status } = useVideo(id);

  if (status === "pending") {
    return (
      <>
        <BackButton />
        <p className="text-muted-foreground">Loading video...</p>
      </>
    );
  }
  if (status === "error") {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 400);
    return (
      <>
        <BackButton />
        <p role="alert" className="text-destructive">
          {missing ? "Video not found." : `Could not load video: ${error.message}`}
        </p>
      </>
    );
  }

  return (
    <article className="mx-auto max-w-4xl">
      <BackButton />
      {video.playbackUrl ? (
        <div className="aspect-video overflow-hidden rounded-md bg-black shadow-md">
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
        <StatusBadge status={video.status} />
        <span>{video.viewCount} views</span>
        <time dateTime={video.createdAt}>{new Date(video.createdAt).toLocaleString()}</time>
      </div>
      {video.description && <p className="mt-4 whitespace-pre-line">{video.description}</p>}
    </article>
  );
}
