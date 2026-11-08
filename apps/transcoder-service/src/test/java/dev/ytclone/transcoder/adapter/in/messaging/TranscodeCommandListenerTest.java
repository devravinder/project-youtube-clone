package dev.ytclone.transcoder.adapter.in.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;

class TranscodeCommandListenerTest {

  private final List<TranscodeJob> jobs = new ArrayList<>();
  private final TranscodeVideo recordingUseCase =
      job -> {
        jobs.add(job);
        return new TranscodeResult(job.videoId(), List.of());
      };
  private final TranscodeCommandListener listener =
      new TranscodeCommandListener(
          Mappers.getMapper(TranscodeCommandMapper.class), recordingUseCase);

  private static TranscodeCommandMessage message(String videoId) {
    return new TranscodeCommandMessage(
        "msg-1", videoId, "raw-videos", videoId + "/source.mp4", "video/mp4", Instant.now());
  }

  @Test
  void handsTheMappedJobToTheUseCase() {
    listener.onTranscodeCommand(message("vid-1"));

    assertThat(jobs).containsExactly(new TranscodeJob("vid-1", "raw-videos", "vid-1/source.mp4"));
  }

  @Test
  void rejectsACommandWithoutAVideoIdSoItIsDeadLettered() {
    assertThatThrownBy(() -> listener.onTranscodeCommand(message(" ")))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("videoId");
    assertThat(jobs).isEmpty();
  }

  @Test
  void propagatesUseCaseFailuresSoTheMessageIsRejected() {
    TranscodeCommandListener failing =
        new TranscodeCommandListener(
            Mappers.getMapper(TranscodeCommandMapper.class),
            job -> {
              throw new IllegalStateException("disk full");
            });

    assertThatThrownBy(() -> failing.onTranscodeCommand(message("vid-2"))).hasMessage("disk full");
  }
}
