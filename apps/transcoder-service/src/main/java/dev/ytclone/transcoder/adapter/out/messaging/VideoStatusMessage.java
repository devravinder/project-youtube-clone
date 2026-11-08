package dev.ytclone.transcoder.adapter.out.messaging;

import java.time.Instant;
import java.util.List;

/** Wire format from contracts/video-status.schema.json. */
public record VideoStatusMessage(
    String messageId,
    String videoId,
    String status,
    List<Rendition> renditions,
    String reason,
    Instant occurredAt) {

  public record Rendition(String name, String key) {}
}
