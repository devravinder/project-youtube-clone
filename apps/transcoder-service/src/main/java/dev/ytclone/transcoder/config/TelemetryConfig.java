package dev.ytclone.transcoder.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Boot exports traces and metrics itself; the Logback appender only needs Boot's SDK handed over.
 */
@Configuration
@Profile("local-observability")
class TelemetryConfig {

  @Bean
  InitializingBean installOpenTelemetryAppender(OpenTelemetry openTelemetry) {
    return () -> OpenTelemetryAppender.install(openTelemetry);
  }
}
