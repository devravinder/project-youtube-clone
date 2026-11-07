import { Link } from "react-router-dom";
import type { VideoSummary } from "../types";
import { Play } from "lucide-react";
import { StatusBadge } from "./status-badge";

export function VideoCard({ video }: { readonly video: VideoSummary }) {
  return (
    <Link
      to={`/watch/${video.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-md border border-border bg-card transition hover:border-primary"
    >
      <div className="flex aspect-video items-center justify-center bg-primary/10 text-primary">
        <Play className="size-10 transition group-hover:scale-110" fill="currentColor" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="truncate text-lg font-semibold text-primary">{video.title}</h2>
        {video.description && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{video.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <StatusBadge status={video.status} />
          <time dateTime={video.createdAt}>{new Date(video.createdAt).toLocaleString()}</time>
        </div>
      </div>
    </Link>
  );
}
