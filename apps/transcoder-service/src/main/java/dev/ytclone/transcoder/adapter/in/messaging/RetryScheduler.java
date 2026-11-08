package dev.ytclone.transcoder.adapter.in.messaging;

import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RetryScheduler {

  private final RabbitTemplate rabbitTemplate;

  /** Parks the command in the retry queue; it returns to the work queue after the TTL. */
  public void schedule(TranscodeCommandMessage message, int nextAttempt) {
    rabbitTemplate.convertAndSend(
        "",
        TranscodeTopology.RETRY_QUEUE,
        message,
        m -> {
          m.getMessageProperties().setHeader(TranscodeTopology.ATTEMPT_HEADER, nextAttempt);
          m.getMessageProperties().setMessageId(message.messageId());
          return m;
        });
  }
}
