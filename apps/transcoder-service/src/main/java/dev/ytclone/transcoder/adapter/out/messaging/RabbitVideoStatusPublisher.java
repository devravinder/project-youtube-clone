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
    send(videoId, "PROCESSING", List.of(), null);
  }

  @Override
  public void ready(TranscodeResult result) {
    List<VideoStatusMessage.Rendition> renditions =
        result.outputKeys().stream()
            .map(key -> new VideoStatusMessage.Rendition(renditionName(key), key))
            .toList();
    send(result.videoId(), "READY", renditions, null);
  }

  @Override
  public void failed(String videoId, String reason) {
    send(videoId, "FAILED", List.of(), reason);
  }

  private void send(
      String videoId, String status, List<VideoStatusMessage.Rendition> renditions, String reason) {
    sender.accept(
        new VideoStatusMessage(
            UUID.randomUUID().toString(), videoId, status, renditions, reason, clock.instant()));
  }

  // Keys are "<videoId>/<name>.mp4".
  static String renditionName(String key) {
    String file = key.substring(key.lastIndexOf('/') + 1);
    int dot = file.lastIndexOf('.');
    return dot < 0 ? file : file.substring(0, dot);
  }
}
