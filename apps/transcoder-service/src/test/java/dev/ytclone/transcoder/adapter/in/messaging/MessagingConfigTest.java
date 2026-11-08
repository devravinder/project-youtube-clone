package dev.ytclone.transcoder.adapter.in.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;

class MessagingConfigTest {

  private final Declarables topology = MessagingConfig.topology(Duration.ofSeconds(10));

  private Queue queue(String name) {
    return topology.getDeclarablesByType(Queue.class).stream()
        .filter(q -> q.getName().equals(name))
        .findFirst()
        .orElseThrow();
  }

  // upload-service declares the same arguments; RabbitMQ refuses a mismatch.
  @Test
  void workQueueIsADurableQuorumQueueThatDeadLettersToTheDlx() {
    Queue queue = queue(TranscodeTopology.QUEUE);

    assertThat(queue.isDurable()).isTrue();
    assertThat(queue.getArguments())
        .containsExactlyInAnyOrderEntriesOf(
            Map.of(
                "x-queue-type", "quorum",
                "x-dead-letter-exchange", "yt.transcode.dlx",
                "x-dead-letter-routing-key", "transcode.cmd"));
  }

  @Test
  void retryQueueHoldsCommandsForTheDelayThenSendsThemBackToTheWorkQueue() {
    Queue retry = queue(TranscodeTopology.RETRY_QUEUE);

    assertThat(retry.isDurable()).isTrue();
    assertThat(retry.getArguments())
        .containsExactlyInAnyOrderEntriesOf(
            Map.of(
                "x-queue-type", "quorum",
                "x-message-ttl", 10_000,
                "x-dead-letter-exchange", "yt.transcode",
                "x-dead-letter-routing-key", "transcode.cmd"));
    // No binding: only the transcoder publishes to it, through the default exchange.
    assertThat(topology.getDeclarablesByType(Binding.class))
        .noneMatch(b -> b.getDestination().equals(TranscodeTopology.RETRY_QUEUE));
  }

  @Test
  void deadLetterQueueIsADurableQuorumQueue() {
    Queue dlq = queue(TranscodeTopology.DEAD_LETTER_QUEUE);

    assertThat(dlq.isDurable()).isTrue();
    assertThat(dlq.getArguments()).containsExactlyEntriesOf(Map.of("x-queue-type", "quorum"));
  }

  @Test
  void bindsEachQueueToItsDirectExchangeWithTheCommandRoutingKey() {
    assertThat(topology.getDeclarablesByType(DirectExchange.class))
        .extracting(DirectExchange::getName, DirectExchange::isDurable)
        .containsExactlyInAnyOrder(tuple("yt.transcode", true), tuple("yt.transcode.dlx", true));
    assertThat(topology.getDeclarablesByType(Binding.class))
        .extracting(Binding::getExchange, Binding::getDestination, Binding::getRoutingKey)
        .containsExactlyInAnyOrder(
            tuple("yt.transcode", "transcoder.transcode-video", "transcode.cmd"),
            tuple("yt.transcode.dlx", "transcoder.transcode-video.dlq", "transcode.cmd"));
  }
}
