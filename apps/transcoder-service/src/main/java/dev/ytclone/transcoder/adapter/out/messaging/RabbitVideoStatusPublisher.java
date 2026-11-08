package dev.ytclone.transcoder.adapter.out.messaging;

import dev.ytclone.transcoder.application.port.out.VideoStatusPort;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import lombok.RequiredArgsConstructor;

@RequiredArgsConstructor
public class RabbitVideoStatusPublisher implements VideoStatusPort {

  private final Consumer<VideoStatusMessage> sender;
  private final Clock clock;

  @Override
  public void processing(String videoId) {
    send(videoId, "PROCESSING", null, List.of(), null);
  }

  @Override
  public void ready(TranscodeResult result) {
    List<VideoStatusMessage.Rendition> renditions =
        result.outputKeys().stream()
            .map(key -> new VideoStatusMessage.Rendition(renditionName(key), key))
            .toList();
    send(result.videoId(), "READY", result.masterPlaylistKey(), renditions, null);
  }

  @Override
  public void failed(String videoId, String reason) {
    send(videoId, "FAILED", null, List.of(), reason);
  }

  private void send(
      String videoId,
      String status,
      String masterPlaylist,
      List<VideoStatusMessage.Rendition> renditions,
      String reason) {
    sender.accept(
        new VideoStatusMessage(
            UUID.randomUUID().toString(),
            videoId,
            status,
            masterPlaylist,
            renditions,
            reason,
            clock.instant()));
  }

  // Variant keys are "<videoId>/hls/<name>/index.m3u8".
  static String renditionName(String key) {
    String dir = key.substring(0, Math.max(key.lastIndexOf('/'), 0));
    return dir.substring(dir.lastIndexOf('/') + 1);
  }
}
