import { useState } from "react";
import ReactPlayer from "react-player";
import { useParams } from "react-router-dom";
import { BackButton } from "../components/back-button";
import { ProcessingStatus } from "../components/processing-status";
import { StatusBadge } from "../components/status-badge";
import { isProcessing, useVideo } from "../queries/videos";
import { ApiError } from "../services/api";
import type { VideoDetail } from "../types";

function Player({ video }: { readonly video: VideoDetail }) {
  // Renditions arrive highest first; an unknown choice falls back to the default.
  const [quality, setQuality] = useState<string | null>(null);
  const selected = video.renditions.find((r) => r.name === quality) ?? video.renditions[0];
  const src = selected?.playbackUrl ?? video.playbackUrl;

  if (!src) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
        The file has not been uploaded yet.
      </div>
    );
  }
  return (
    <>
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        <ReactPlayer src={src} controls width="100%" height="100%" title={video.title} />
      </div>
      {video.renditions.length > 1 && (
        <label className="mt-2 flex items-center justify-end gap-2 text-sm">
          Quality
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={selected?.name}
            onChange={(event) => setQuality(event.target.value)}
          >
            {video.renditions.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

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
      ) : (
        <Player key={video.id} video={video} />
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
