package dev.ytclone.transcoder.adapter.in.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.AppProperties;
import dev.ytclone.transcoder.application.PermanentFailureException;
import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;

class TranscodeCommandListenerTest {

  private static final AppProperties PROPERTIES =
      new AppProperties(
          new AppProperties.Storage("http://s3", "us-east-1", "k", "s", true, "raw", "hls"),
          new AppProperties.Transcode(
              Path.of("work"),
              new AppProperties.Ffmpeg("ffmpeg", "ffprobe", "", Duration.ofMinutes(1)),
              new AppProperties.Retry(3, Duration.ofSeconds(10))));

  private final List<TranscodeJob> jobs = new ArrayList<>();
  private final List<Integer> retries = new ArrayList<>();
  private final List<String> failures = new ArrayList<>();
  private Consumer<TranscodeJob> behaviour = job -> {};

  private final TranscodeVideo useCase =
      job -> {
        jobs.add(job);
        behaviour.accept(job);
        return new TranscodeResult(job.videoId(), job.videoId() + "/hls/master.m3u8", List.of());
      };

  private final RetryScheduler retryScheduler =
      new RetryScheduler(null) {
        @Override
        public void schedule(TranscodeCommandMessage message, int nextAttempt) {
          retries.add(nextAttempt);
        }
      };

  private final TranscodeCommandListener listener =
      new TranscodeCommandListener(
          Mappers.getMapper(TranscodeCommandMapper.class),
          useCase,
          (videoId, reason) -> failures.add(videoId + ": " + reason),
          retryScheduler,
          PROPERTIES);

  private static TranscodeCommandMessage message(String videoId) {
    return new TranscodeCommandMessage(
        "msg-1", videoId, "raw-videos", videoId + "/source.mp4", "video/mp4", Instant.now());
  }

  @Test
  void handsTheMappedJobToTheUseCase() {
    listener.onTranscodeCommand(message("vid-1"), null);

    assertThat(jobs).containsExactly(new TranscodeJob("vid-1", "raw-videos", "vid-1/source.mp4"));
    assertThat(retries).isEmpty();
  }

  @Test
  void deadLettersAnInvalidCommandWithoutRetrying() {
    assertThatThrownBy(() -> listener.onTranscodeCommand(message(" "), null))
        .isInstanceOf(AmqpRejectAndDontRequeueException.class)
        .hasRootCauseInstanceOf(IllegalArgumentException.class);
    assertThat(jobs).isEmpty();
    assertThat(retries).isEmpty();
    assertThat(failures).isEmpty();
  }

  @Test
  void deadLettersAPermanentFailureWithoutRetrying() {
    behaviour =
        job -> {
          throw new PermanentFailureException("not a video");
        };

    assertThatThrownBy(() -> listener.onTranscodeCommand(message("vid-2"), null))
        .isInstanceOf(AmqpRejectAndDontRequeueException.class)
        .hasRootCauseMessage("not a video");
    assertThat(retries).isEmpty();
    assertThat(failures).containsExactly("vid-2: not a video");
  }

  @Test
  void schedulesTheNextAttemptForATransientFailureAndAcks() {
    behaviour =
        job -> {
          throw new IllegalStateException("storage unavailable");
        };

    listener.onTranscodeCommand(message("vid-3"), null);
    listener.onTranscodeCommand(message("vid-3"), 2);

    assertThat(retries).containsExactly(2, 3);
    assertThat(failures).isEmpty();
  }

  @Test
  void deadLettersOnTheLastAttempt() {
    behaviour =
        job -> {
          throw new IllegalStateException("storage unavailable");
        };

    assertThatThrownBy(() -> listener.onTranscodeCommand(message("vid-4"), 3))
        .isInstanceOf(AmqpRejectAndDontRequeueException.class)
        .hasMessage("Retries exhausted");
    assertThat(retries).isEmpty();
    assertThat(failures).containsExactly("vid-4: Gave up after 3 attempts: storage unavailable");
  }
}
