package dev.ytclone.transcoder.config;

import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
class TranscodeConfig {

  // Placeholder: the ffmpeg task replaces this with TranscodeService and real adapters.
  @Bean
  TranscodeVideo transcodeVideo() {
    return job -> {
      log.info("Accepted job for video {}; renditions are not produced yet", job.videoId());
      return new TranscodeResult(job.videoId(), List.of());
    };
  }
}
