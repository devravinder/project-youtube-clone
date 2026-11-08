package dev.ytclone.transcoder.adapter.in.messaging;

import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.DEAD_LETTER_EXCHANGE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.DEAD_LETTER_QUEUE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.EXCHANGE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.QUEUE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.RETRY_QUEUE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.ROUTING_KEY;

import dev.ytclone.transcoder.AppProperties;
import java.time.Duration;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Declarables;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class MessagingConfig {

  @Bean
  Declarables transcodeTopology(AppProperties properties) {
    return topology(properties.transcode().retry().delay());
  }

  // The exchange, work queue and DLQ match upload-service exactly; either may start first.
  static Declarables topology(Duration retryDelay) {
    DirectExchange exchange = new DirectExchange(EXCHANGE, true, false);
    DirectExchange deadLetterExchange = new DirectExchange(DEAD_LETTER_EXCHANGE, true, false);
    Queue queue =
        QueueBuilder.durable(QUEUE)
            .quorum()
            .deadLetterExchange(DEAD_LETTER_EXCHANGE)
            .deadLetterRoutingKey(ROUTING_KEY)
            .build();
    Queue deadLetterQueue = QueueBuilder.durable(DEAD_LETTER_QUEUE).quorum().build();
    // No consumer: messages expire after the delay and go back to the work queue.
    Queue retryQueue =
        QueueBuilder.durable(RETRY_QUEUE)
            .quorum()
            .ttl((int) retryDelay.toMillis())
            .deadLetterExchange(EXCHANGE)
            .deadLetterRoutingKey(ROUTING_KEY)
            .build();
    return new Declarables(
        exchange,
        deadLetterExchange,
        queue,
        deadLetterQueue,
        retryQueue,
        BindingBuilder.bind(queue).to(exchange).with(ROUTING_KEY),
        BindingBuilder.bind(deadLetterQueue).to(deadLetterExchange).with(ROUTING_KEY));
  }

  @Bean
  MessageConverter jsonMessageConverter() {
    return new JacksonJsonMessageConverter();
  }
}
