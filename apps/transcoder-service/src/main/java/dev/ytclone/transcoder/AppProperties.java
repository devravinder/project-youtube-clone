package dev.ytclone.transcoder;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.nio.file.Path;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app")
public record AppProperties(@Valid @NotNull Storage storage, @Valid @NotNull Transcode transcode) {

  public record Storage(
      @NotBlank String endpoint,
      @NotBlank String region,
      @NotBlank String accessKey,
      @NotBlank String secretKey,
      boolean forcePathStyle,
      @NotBlank String rawBucket,
      @NotBlank String hlsBucket) {}

  public record Transcode(@NotNull Path workDir) {}
}
