package dev.ytclone.transcoder.adapter.in.messaging;

import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.DEAD_LETTER_EXCHANGE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.DEAD_LETTER_QUEUE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.EXCHANGE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.QUEUE;
import static dev.ytclone.transcoder.adapter.in.messaging.TranscodeTopology.ROUTING_KEY;

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

  // Either service may start first, so both declare identical topology.
  @Bean
  Declarables transcodeTopology() {
    DirectExchange exchange = new DirectExchange(EXCHANGE, true, false);
    DirectExchange deadLetterExchange = new DirectExchange(DEAD_LETTER_EXCHANGE, true, false);
    Queue queue =
        QueueBuilder.durable(QUEUE)
            .quorum()
            .deadLetterExchange(DEAD_LETTER_EXCHANGE)
            .deadLetterRoutingKey(ROUTING_KEY)
            .build();
    Queue deadLetterQueue = QueueBuilder.durable(DEAD_LETTER_QUEUE).quorum().build();
    return new Declarables(
        exchange,
        deadLetterExchange,
        queue,
        deadLetterQueue,
        BindingBuilder.bind(queue).to(exchange).with(ROUTING_KEY),
        BindingBuilder.bind(deadLetterQueue).to(deadLetterExchange).with(ROUTING_KEY));
  }

  @Bean
  MessageConverter jsonMessageConverter() {
    return new JacksonJsonMessageConverter();
  }
}
