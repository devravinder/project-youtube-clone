import { Link } from "react-router-dom";
import type { VideoSummary } from "../types";
import { PlayIcon } from "./icons";
import { StatusBadge } from "./status-badge";

export function VideoCard({ video }: { readonly video: VideoSummary }) {
  return (
    <Link
      to={`/watch/${video.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex aspect-video items-center justify-center bg-linear-to-br from-primary/30 via-primary/10 to-muted text-primary">
        <PlayIcon className="size-10 opacity-70 transition group-hover:scale-110 group-hover:opacity-100" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h2 className="truncate font-medium">{video.title}</h2>
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
