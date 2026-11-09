import { VIDEO_READY, type VideoReadyEvent, videoEventSchema } from "@yt/contracts";
import type { SearchIndexPort, VideoDocument } from "../search/search-index.port.js";

export type Outcome =
  | { kind: "indexed" }
  | { kind: "stale" }
  | { kind: "skipped"; reason: string }
  | { kind: "dead-letter"; reason: string };

const KNOWN_TYPES = new Set<string>([VIDEO_READY]);

export function toDocument(event: VideoReadyEvent): VideoDocument {
  const { title, description, ownerId, renditions, createdAt } = event.video;
  return { title, description, ownerId, renditions, createdAt, readyAt: event.occurredAt };
}

/** Index errors are thrown (transient, retry); bad input is returned as a dead-letter. */
export async function handleVideoEvent(
  value: string | undefined,
  typeHeader: string | undefined,
  index: SearchIndexPort,
): Promise<Outcome> {
  // Newer event types are for other consumers; skipping them keeps this one forward compatible.
  if (typeHeader && !KNOWN_TYPES.has(typeHeader)) {
    return { kind: "skipped", reason: `event type ${typeHeader} is not indexed` };
  }
  let json: unknown;
  try {
    json = JSON.parse(value ?? "");
  } catch {
    return { kind: "dead-letter", reason: "value is not JSON" };
  }
  const parsed = videoEventSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      kind: "dead-letter",
      reason: `invalid event: ${issue?.path.join(".") || "(root)"} ${issue?.message ?? ""}`.trim(),
    };
  }
  const event = parsed.data;
  // occurredAt as the version: replays and duplicates never overwrite something newer.
  const result = await index.upsert(
    event.video.id,
    Date.parse(event.occurredAt),
    toDocument(event),
  );
  return { kind: result === "written" ? "indexed" : "stale" };
}
