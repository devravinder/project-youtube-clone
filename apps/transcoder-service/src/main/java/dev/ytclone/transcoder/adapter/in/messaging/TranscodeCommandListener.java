package dev.ytclone.transcoder.adapter.in.messaging;

import dev.ytclone.transcoder.AppProperties;
import dev.ytclone.transcoder.application.PermanentFailureException;
import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class TranscodeCommandListener {

  private final TranscodeCommandMapper mapper;
  private final TranscodeVideo transcodeVideo;
  private final RetryScheduler retryScheduler;
  private final AppProperties properties;

  /**
   * Permanent failures and the last attempt are rejected, so the broker dead-letters them; other
   * failures are parked in the retry queue and this delivery is acked.
   */
  @RabbitListener(queues = TranscodeTopology.QUEUE)
  public void onTranscodeCommand(
      TranscodeCommandMessage message,
      @Header(name = TranscodeTopology.ATTEMPT_HEADER, required = false) Integer attemptHeader) {
    int attempt = attemptHeader == null ? 1 : attemptHeader;
    int maxAttempts = properties.transcode().retry().maxAttempts();
    log.info(
        "Received transcode command {} for video {} (attempt {}/{})",
        message.messageId(),
        message.videoId(),
        attempt,
        maxAttempts);
    try {
      transcodeVideo.transcode(mapper.toJob(message));
    } catch (IllegalArgumentException | PermanentFailureException e) {
      log.error("Video {} cannot be transcoded: {}", message.videoId(), e.getMessage());
      throw new AmqpRejectAndDontRequeueException("Permanent failure", e);
    } catch (RuntimeException e) {
      if (attempt >= maxAttempts) {
        log.error(
            "Video {} failed {} times; dead-lettering: {}",
            message.videoId(),
            attempt,
            e.getMessage());
        throw new AmqpRejectAndDontRequeueException("Retries exhausted", e);
      }
      log.warn(
          "Video {} failed on attempt {}; retrying in {}: {}",
          message.videoId(),
          attempt,
          properties.transcode().retry().delay(),
          e.getMessage());
      retryScheduler.schedule(message, attempt + 1);
    }
  }
}
