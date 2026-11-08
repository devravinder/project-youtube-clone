package dev.ytclone.transcoder.adapter.in.messaging;

import java.time.Instant;

/** Wire format from contracts/transcode-command.schema.json. */
public record TranscodeCommandMessage(
    String messageId,
    String videoId,
    String sourceBucket,
    String sourceKey,
    String contentType,
    Instant requestedAt) {}
