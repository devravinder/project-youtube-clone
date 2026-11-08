package dev.ytclone.transcoder.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.ytclone.transcoder.AppProperties;
import dev.ytclone.transcoder.TranscoderServiceApplication;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

class ProfilesTest {

  private static ConfigurableApplicationContext start(String... args) {
    return new SpringApplicationBuilder(TranscoderServiceApplication.class)
        .web(WebApplicationType.NONE)
        // No broker in tests.
        .properties("spring.rabbitmq.listener.simple.auto-startup=false")
        .run(args);
  }

  @Test
  void localIsTheDefaultAndPointsAtTheComposeMinio() {
    try (var context = start()) {
      AppProperties properties = context.getBean(AppProperties.class);

      assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("local");
      assertThat(properties.storage().endpoint()).isEqualTo("http://localhost:9000");
      assertThat(properties.storage().accessKey()).isEqualTo("minioadmin");
      assertThat(properties.storage().forcePathStyle()).isTrue();
      assertThat(context.getEnvironment().getProperty("spring.rabbitmq.username")).isEqualTo("yt");
    }
  }

  @Test
  void listenerDeadLettersFailuresAndTakesOneMessageAtATime() {
    try (var context = start()) {
      assertThat(
              context
                  .getEnvironment()
                  .getProperty("spring.rabbitmq.listener.simple.default-requeue-rejected"))
          .isEqualTo("false");
      assertThat(context.getEnvironment().getProperty("spring.rabbitmq.listener.simple.prefetch"))
          .isEqualTo("1");
    }
  }

  @Test
  void localObservabilityAlsoActivatesLocalAndExposesMetrics() {
    try (var context = start("--spring.profiles.active=local-observability")) {
      assertThat(context.getEnvironment().getActiveProfiles())
          .contains("local-observability", "local");
      assertThat(context.getEnvironment().getProperty("management.endpoints.web.exposure.include"))
          .contains("metrics");
      assertThat(context.getBean(AppProperties.class).storage().endpoint())
          .isEqualTo("http://localhost:9000");
    }
  }

  @Test
  void awsRefusesToStartWithoutStorageSettings() {
    assumeTrue(
        Stream.of("STORAGE_ENDPOINT", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY")
            .allMatch(name -> System.getenv(name) == null),
        "STORAGE_* variables are set in this shell");

    assertThatThrownBy(() -> start("--spring.profiles.active=aws"))
        .rootCause()
        .hasMessageContaining("app.storage")
        .hasMessageContaining("endpoint")
        .hasMessageContaining("accessKey")
        .hasMessageContaining("secretKey");
  }

  @Test
  void awsStartsWithStorageSettingsFromTheEnvironment() {
    try (var context =
        start(
            "--spring.profiles.active=aws",
            "--app.storage.endpoint=https://s3.eu-west-1.amazonaws.com",
            "--app.storage.access-key=AKIA-TEST",
            "--app.storage.secret-key=secret")) {
      AppProperties properties = context.getBean(AppProperties.class);

      assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("aws");
      assertThat(properties.storage().forcePathStyle()).isFalse();
      assertThat(properties.storage().rawBucket()).isEqualTo("raw-videos");
    }
  }
}
