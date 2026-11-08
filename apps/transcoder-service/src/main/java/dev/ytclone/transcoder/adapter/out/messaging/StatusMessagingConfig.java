package dev.ytclone.transcoder.adapter.out.messaging;

import java.time.Clock;
import java.time.Duration;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StatusMessagingConfig {

  private static final Duration CONFIRM_TIMEOUT = Duration.ofSeconds(10);

  // Declared here too, so publishing works before upload-service has ever started.
  @Bean
  DirectExchange videoStatusExchange() {
    return new DirectExchange(StatusTopology.EXCHANGE, true, false);
  }

  @Bean
  RabbitVideoStatusPublisher videoStatusPublisher(RabbitTemplate rabbitTemplate) {
    return new RabbitVideoStatusPublisher(
        message ->
            // Waits for the broker's confirm, so a lost status event fails the job and is retried.
            rabbitTemplate.invoke(ops -> {
              ops.convertAndSend(StatusTopology.EXCHANGE, StatusTopology.ROUTING_KEY, message);
              ops.waitForConfirmsOrDie(CONFIRM_TIMEOUT.toMillis());
              return null;
            }),
        Clock.systemUTC());
  }
}
