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
    // Waits for the confirm: the original delivery is acked right after this returns.
    rabbitTemplate.invoke(ops -> {
      ops.convertAndSend(
          "",
          TranscodeTopology.RETRY_QUEUE,
          message,
          m -> {
            m.getMessageProperties().setHeader(TranscodeTopology.ATTEMPT_HEADER, nextAttempt);
            m.getMessageProperties().setMessageId(message.messageId());
            return m;
          });
      ops.waitForConfirmsOrDie(10_000);
      return null;
    });
  }
}
