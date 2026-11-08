package dev.ytclone.transcoder.application.service;

import dev.ytclone.transcoder.application.port.in.ReportTranscodeFailure;
import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import dev.ytclone.transcoder.application.port.out.StoragePort;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.application.port.out.VideoStatusPort;
import dev.ytclone.transcoder.domain.HlsMasterPlaylist;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.RenditionLadder;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeManifest;
import dev.ytclone.transcoder.domain.TranscodeResult;
import dev.ytclone.transcoder.domain.VideoInfo;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class TranscodeService implements TranscodeVideo, ReportTranscodeFailure {

  private static final String PLAYLIST_TYPE = "application/vnd.apple.mpegurl";

  private final StoragePort storage;
  private final TranscoderPort transcoder;
  private final Path workRoot;
  private final String outputBucket;
  private final VideoStatusPort status;

  @Override
  public TranscodeResult transcode(TranscodeJob job) {
    String manifestKey = TranscodeManifest.key(job.videoId());
    // At-least-once delivery: a finished video is skipped instead of encoded again.
    var done =
        storage
            .readText(outputBucket, manifestKey)
            .flatMap(TranscodeManifest::fromJson)
            .filter(result -> result.videoId().equals(job.videoId()));
    if (done.isPresent()) {
      log.info("Video {} is already transcoded; skipping duplicate command", job.videoId());
      // Re-announce: the first READY may be the event that got lost.
      status.ready(done.get());
      return done.get();
    }

    log.info("Transcoding video {}", job.videoId());
    status.processing(job.videoId());
    Path workDir = createWorkDir(job);
    try {
      Path source = workDir.resolve("source");
      storage.download(job.sourceBucket(), job.sourceKey(), source);

      VideoInfo info = transcoder.probe(source);
      List<Rendition> ladder = RenditionLadder.forSourceHeight(info.height());
      String prefix = job.videoId() + "/hls/";
      List<String> outputKeys = new ArrayList<>();
      for (Rendition rendition : ladder) {
        Path outputDir = workDir.resolve("hls").resolve(rendition.name());
        transcoder.transcodeToHls(source, rendition, outputDir);
        uploadDirectory(outputDir, prefix + rendition.name() + "/");
        outputKeys.add(prefix + HlsMasterPlaylist.variantPath(rendition));
      }
      // The master playlist goes up after its variants, so it never points at missing files.
      String masterKey = prefix + HlsMasterPlaylist.FILE_NAME;
      storage.writeText(
          outputBucket, masterKey, HlsMasterPlaylist.render(ladder, info), PLAYLIST_TYPE);

      TranscodeResult result = new TranscodeResult(job.videoId(), masterKey, outputKeys);
      storage.writeText(
          outputBucket, manifestKey, TranscodeManifest.toJson(result), "application/json");
      log.info("Transcoded video {} into {} renditions", job.videoId(), outputKeys.size());
      status.ready(result);
      return result;
    } finally {
      deleteQuietly(workDir);
    }
  }

  @Override
  public void reportFailure(String videoId, String reason) {
    status.failed(videoId, reason);
  }

  // Segments first, playlist last: a player that sees index.m3u8 finds every segment it names.
  private void uploadDirectory(Path dir, String keyPrefix) {
    List<Path> files;
    try (Stream<Path> listing = Files.list(dir)) {
      files =
          listing
              .filter(Files::isRegularFile)
              .sorted(
                  Comparator.comparing((Path p) -> p.getFileName().toString().endsWith(".m3u8"))
                      .thenComparing(p -> p.getFileName().toString()))
              .toList();
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot list " + dir, e);
    }
    for (Path file : files) {
      String name = file.getFileName().toString();
      storage.upload(outputBucket, keyPrefix + name, file, contentType(name));
    }
  }

  private static String contentType(String fileName) {
    if (fileName.endsWith(".m3u8")) {
      return PLAYLIST_TYPE;
    }
    return fileName.endsWith(".ts") ? "video/mp2t" : "application/octet-stream";
  }

  private Path createWorkDir(TranscodeJob job) {
    try {
      Files.createDirectories(workRoot);
      return Files.createTempDirectory(workRoot, job.videoId() + "-");
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot create a work directory in " + workRoot, e);
    }
  }

  private static void deleteQuietly(Path directory) {
    try (Stream<Path> paths = Files.walk(directory)) {
      paths.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
    } catch (IOException e) {
      log.warn("Could not delete work directory {}", directory, e);
    }
  }
}
