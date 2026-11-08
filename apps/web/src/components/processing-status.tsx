import { CircleAlert, LoaderCircle } from "lucide-react";
import type { VideoDetail } from "../types";

/** Live transcoding state; announced politely so screen readers hear when it changes. */
export function ProcessingStatus({ video }: { readonly video: VideoDetail | undefined }) {
  if (!video || video.status === "UPLOADED" || video.status === "PROCESSING") {
    return (
      <p role="status" aria-live="polite" className="inline-flex items-center gap-2">
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
        {video?.status === "PROCESSING" ? "Transcoding..." : "Waiting for the transcoder..."}
      </p>
    );
  }
  if (video.status === "FAILED") {
    return (
      <p role="status" aria-live="polite" className="inline-flex items-center gap-2">
        <CircleAlert aria-hidden="true" className="size-4" />
        Processing failed{video.failureReason ? `: ${video.failureReason}` : "."}
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite">
      Ready to watch in {video.renditions.length}{" "}
      {video.renditions.length === 1 ? "quality" : "qualities"}.
    </p>
  );
}
