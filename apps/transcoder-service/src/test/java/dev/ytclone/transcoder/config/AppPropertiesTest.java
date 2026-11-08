package dev.ytclone.transcoder.config;

import static org.assertj.core.api.Assertions.assertThat;

import dev.ytclone.transcoder.AppProperties;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class AppPropertiesTest {

  private static final String[] VALID = {
    "app.storage.endpoint=http://localhost:9000",
    "app.storage.region=us-east-1",
    "app.storage.access-key=key",
    "app.storage.secret-key=secret",
    "app.storage.force-path-style=true",
    "app.storage.raw-bucket=raw-videos",
    "app.storage.hls-bucket=hls-videos",
    "app.transcode.work-dir=/tmp/yt-transcoder",
    "app.transcode.ffmpeg.path=ffmpeg",
    "app.transcode.ffmpeg.probe-path=ffprobe",
    "app.transcode.ffmpeg.timeout=10m"
  };

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withUserConfiguration(PropertiesConfig.class)
          .withPropertyValues(VALID);

  @EnableConfigurationProperties(AppProperties.class)
  static class PropertiesConfig {}

  @Test
  void bindsKebabCaseKeysIntoTheRecord() {
    runner.run(context -> {
      AppProperties properties = context.getBean(AppProperties.class);

      assertThat(properties.storage().endpoint()).isEqualTo("http://localhost:9000");
      assertThat(properties.storage().accessKey()).isEqualTo("key");
      assertThat(properties.storage().forcePathStyle()).isTrue();
      assertThat(properties.storage().hlsBucket()).isEqualTo("hls-videos");
      assertThat(properties.transcode().workDir()).isEqualTo(Path.of("/tmp/yt-transcoder"));
      assertThat(properties.transcode().ffmpeg().timeout()).isEqualTo(Duration.ofMinutes(10));
      assertThat(properties.transcode().ffmpeg().useDocker()).isFalse();
    });
  }

  @Test
  void aDockerImageSwitchesFfmpegToContainers() {
    runner
        .withPropertyValues("app.transcode.ffmpeg.docker-image=mwader/static-ffmpeg:latest")
        .run(context ->
            assertThat(context.getBean(AppProperties.class).transcode().ffmpeg().useDocker())
                .isTrue());
  }

  @Test
  void rejectsABlankRequiredValue() {
    runner
        .withPropertyValues("app.storage.secret-key= ")
        .run(context -> {
          assertThat(context).hasFailed();
          assertThat(context.getStartupFailure()).rootCause().hasMessageContaining("secretKey");
        });
  }

  @Test
  void rejectsAMissingSection() {
    new ApplicationContextRunner()
        .withUserConfiguration(PropertiesConfig.class)
        .withPropertyValues("app.storage.endpoint=http://localhost:9000")
        .run(context -> assertThat(context).hasFailed());
  }
}
