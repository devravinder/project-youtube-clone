import { useParams } from "react-router-dom";
import { BackButton } from "../components/back-button";
import { HlsVideo } from "../components/hls-video";
import { ProcessingStatus } from "../components/processing-status";
import { StatusBadge } from "../components/status-badge";
import { isProcessing, useVideo } from "../queries/videos";
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
      {isProcessing(video.status) ? (
        <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
          <ProcessingStatus video={video} />
        </div>
      ) : video.playbackUrl ? (
        // READY: the master playlist (adaptive); FAILED: the original file.
        <HlsVideo key={video.playbackUrl} src={video.playbackUrl} title={video.title} />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
          The file has not been uploaded yet.
        </div>
      )}
      {video.status === "FAILED" && (
        <div className="mt-2 text-sm text-destructive">
          <ProcessingStatus video={video} />
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
