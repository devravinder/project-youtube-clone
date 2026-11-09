package dev.ytclone.transcoder.config;

import dev.ytclone.transcoder.AppProperties;
import dev.ytclone.transcoder.adapter.out.ffmpeg.FfmpegLauncher;
import dev.ytclone.transcoder.adapter.out.ffmpeg.FfmpegTranscoder;
import dev.ytclone.transcoder.adapter.out.ffmpeg.SystemProcessRunner;
import dev.ytclone.transcoder.adapter.out.storage.S3StorageAdapter;
import dev.ytclone.transcoder.application.port.out.StoragePort;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.application.port.out.VideoStatusPort;
import dev.ytclone.transcoder.application.service.TranscodeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.services.s3.S3Client;

// TranscodeService stays free of Spring, so it is wired here.
@Slf4j
@Configuration
class TranscodeConfig {

  @Bean
  S3Client s3Client(AppProperties properties) {
    AppProperties.Storage storage = properties.storage();
    return S3StorageAdapter.createClient(
        storage.endpoint(),
        storage.region(),
        storage.accessKey(),
        storage.secretKey(),
        storage.forcePathStyle());
  }

  @Bean
  StoragePort storagePort(S3Client s3Client) {
    return new S3StorageAdapter(s3Client);
  }

  @Bean
  TranscoderPort transcoderPort(AppProperties properties) {
    AppProperties.Ffmpeg ffmpeg = properties.transcode().ffmpeg();
    FfmpegLauncher launcher =
        ffmpeg.useDocker()
            ? FfmpegLauncher.Docker.forCurrentUser(
                ffmpeg.dockerImage(), properties.transcode().workDir())
            : new FfmpegLauncher.Binaries(ffmpeg.path(), ffmpeg.probePath());
    log.info("ffmpeg runs via {}", launcher);
    return new FfmpegTranscoder(new SystemProcessRunner(), launcher, ffmpeg.timeout());
  }

  @Bean
  TranscodeService transcodeService(
      StoragePort storage,
      TranscoderPort transcoder,
      VideoStatusPort status,
      AppProperties properties) {
    return new TranscodeService(
        storage,
        transcoder,
        properties.transcode().workDir(),
        properties.storage().hlsBucket(),
        status);
  }
}
