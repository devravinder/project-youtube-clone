package dev.ytclone.transcoder.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.application.port.out.StoragePort;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.application.port.out.VideoStatusPort;
import dev.ytclone.transcoder.application.service.TranscodeService;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;
import dev.ytclone.transcoder.domain.VideoInfo;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TranscodeServiceTest {

  private static final TranscodeJob JOB =
      new TranscodeJob("vid-1", "raw-videos", "vid-1/source.mp4");
  private static final String MASTER = "out/vid-1/hls/master.m3u8";
  private static final String MANIFEST = "out/vid-1/manifest.json";

  @TempDir Path workRoot;

  private FakeStorage storage;
  private FakeTranscoder transcoder;
  private FakeStatus status;
  private TranscodeService service;

  @BeforeEach
  void setUp() {
    storage = new FakeStorage();
    transcoder = new FakeTranscoder(new VideoInfo(1920, 1080));
    status = new FakeStatus();
    service = new TranscodeService(storage, transcoder, workRoot, "out", status);
  }

  @Test
  void uploadsEveryVariantWithSegmentsBeforeItsPlaylist() {
    service.transcode(JOB);

    assertThat(storage.downloads).containsExactly("raw-videos/vid-1/source.mp4");
    assertThat(storage.uploads)
        .containsExactly(
            "out/vid-1/hls/360p/seg_000.ts",
            "out/vid-1/hls/360p/seg_001.ts",
            "out/vid-1/hls/360p/index.m3u8",
            "out/vid-1/hls/480p/seg_000.ts",
            "out/vid-1/hls/480p/seg_001.ts",
            "out/vid-1/hls/480p/index.m3u8",
            "out/vid-1/hls/720p/seg_000.ts",
            "out/vid-1/hls/720p/seg_001.ts",
            "out/vid-1/hls/720p/index.m3u8",
            "out/vid-1/hls/1080p/seg_000.ts",
            "out/vid-1/hls/1080p/seg_001.ts",
            "out/vid-1/hls/1080p/index.m3u8");
    assertThat(storage.contentTypes.get("out/vid-1/hls/360p/seg_000.ts")).isEqualTo("video/mp2t");
    assertThat(storage.contentTypes.get("out/vid-1/hls/360p/index.m3u8"))
        .isEqualTo("application/vnd.apple.mpegurl");
    assertThat(storage.uploadedContent).containsEntry("out/vid-1/hls/720p/seg_001.ts", "720p-1");
  }

  @Test
  void writesTheMasterPlaylistAfterTheVariantsAndTheManifestLast() {
    TranscodeResult result = service.transcode(JOB);

    assertThat(storage.textOrder).containsExactly(MASTER, MANIFEST);
    assertThat(storage.texts.get(MASTER))
        .startsWith("#EXTM3U")
        .contains("RESOLUTION=640x360", "RESOLUTION=1920x1080", "360p/index.m3u8");
    assertThat(storage.textTypes.get(MASTER)).isEqualTo("application/vnd.apple.mpegurl");
    assertThat(result.masterPlaylistKey()).isEqualTo("vid-1/hls/master.m3u8");
    assertThat(result.outputKeys())
        .containsExactly(
            "vid-1/hls/360p/index.m3u8",
            "vid-1/hls/480p/index.m3u8",
            "vid-1/hls/720p/index.m3u8",
            "vid-1/hls/1080p/index.m3u8");
  }

  @Test
  void neverUpscalesASmallSource() {
    transcoder = new FakeTranscoder(new VideoInfo(854, 480));
    service = new TranscodeService(storage, transcoder, workRoot, "out", status);

    TranscodeResult result = service.transcode(JOB);

    assertThat(result.outputKeys())
        .containsExactly("vid-1/hls/360p/index.m3u8", "vid-1/hls/480p/index.m3u8");
    assertThat(transcoder.transcoded).extracting(Rendition::height).containsExactly(360, 480);
  }

  @Test
  void reportsProcessingThenReadyWithEveryRendition() {
    service.transcode(JOB);

    assertThat(status.events).containsExactly("PROCESSING vid-1", "READY vid-1 4");
  }

  @Test
  void skipsADuplicateCommandOnceTheManifestExistsAndReportsReadyAgain() {
    TranscodeResult first = service.transcode(JOB);
    storage.downloads.clear();
    storage.uploads.clear();
    status.events.clear();

    TranscodeResult second = service.transcode(JOB);

    assertThat(second).isEqualTo(first);
    assertThat(storage.downloads).isEmpty();
    assertThat(storage.uploads).isEmpty();
    assertThat(status.events).containsExactly("READY vid-1 4");
  }

  @Test
  void encodesAgainWhenAFailedRunLeftNoManifest() {
    transcoder.failOn = "720p";
    assertThatThrownBy(() -> service.transcode(JOB)).hasMessage("ffmpeg failed for 720p");
    assertThat(storage.texts).doesNotContainKeys(MASTER, MANIFEST);
    assertThat(status.events).containsExactly("PROCESSING vid-1");

    transcoder.failOn = null;
    storage.uploads.clear();
    service.transcode(JOB);

    assertThat(storage.uploads).hasSize(12);
  }

  @Test
  void ignoresAManifestForAnotherVideoOrFromBeforeHls() {
    storage.texts.put(MANIFEST, "{\"videoId\":\"vid-1\",\"renditions\":[\"vid-1/360p.mp4\"]}");

    service.transcode(JOB);

    assertThat(storage.uploads).hasSize(12);
  }

  @Test
  void reportsAFailureItIsToldAbout() {
    service.reportFailure("vid-9", "not a video");

    assertThat(status.events).containsExactly("FAILED vid-9 not a video");
  }

  @Test
  void removesItsWorkDirectoryAfterSuccessAndFailure() {
    service.transcode(JOB);
    assertThat(listWorkRoot()).isEmpty();

    transcoder.failOn = "360p";
    assertThatThrownBy(() -> service.transcode(new TranscodeJob("vid-2", "raw-videos", "k")));
    assertThat(listWorkRoot()).isEmpty();
  }

  @Test
  void removesItsWorkDirectoryWhenTheDownloadFails() {
    storage.failDownload = true;

    assertThatThrownBy(() -> service.transcode(JOB)).hasMessage("storage unavailable");

    assertThat(listWorkRoot()).isEmpty();
    assertThat(transcoder.transcoded).isEmpty();
  }

  @Test
  void usesAnIsolatedDirectoryPerJob() {
    service.transcode(JOB);
    service.transcode(new TranscodeJob("vid-2", "raw-videos", "vid-2/source.mp4"));

    assertThat(storage.downloadTargets).hasSize(2).doesNotHaveDuplicates();
  }

  @Test
  void failsClearlyWhenTheWorkRootCannotBeCreated() throws IOException {
    Path file = Files.createFile(workRoot.resolve("not-a-directory"));
    TranscodeService broken =
        new TranscodeService(storage, transcoder, file.resolve("nested"), "out", status);

    assertThatThrownBy(() -> broken.transcode(JOB))
        .isInstanceOf(UncheckedIOException.class)
        .hasMessageContaining("Cannot create a work directory");
    assertThat(storage.downloads).isEmpty();
  }

  private List<Path> listWorkRoot() {
    try (Stream<Path> children = Files.list(workRoot)) {
      return children.toList();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static final class FakeStorage implements StoragePort {
    final List<String> downloads = new ArrayList<>();
    final List<Path> downloadTargets = new ArrayList<>();
    final List<String> uploads = new ArrayList<>();
    final Map<String, String> contentTypes = new HashMap<>();
    final Map<String, String> uploadedContent = new HashMap<>();
    final Map<String, String> texts = new HashMap<>();
    final Map<String, String> textTypes = new HashMap<>();
    final List<String> textOrder = new ArrayList<>();
    boolean failDownload;

    @Override
    public Optional<String> readText(String bucket, String key) {
      return Optional.ofNullable(texts.get(bucket + "/" + key));
    }

    @Override
    public void writeText(String bucket, String key, String text, String contentType) {
      texts.put(bucket + "/" + key, text);
      textTypes.put(bucket + "/" + key, contentType);
      textOrder.add(bucket + "/" + key);
    }

    @Override
    public void download(String bucket, String key, Path target) {
      if (failDownload) {
        throw new IllegalStateException("storage unavailable");
      }
      downloads.add(bucket + "/" + key);
      downloadTargets.add(target);
      write(target, "source-bytes");
    }

    @Override
    public void upload(String bucket, String key, Path source, String contentType) {
      uploads.add(bucket + "/" + key);
      contentTypes.put(bucket + "/" + key, contentType);
      try {
        uploadedContent.put(bucket + "/" + key, Files.readString(source));
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    }
  }

  private static final class FakeStatus implements VideoStatusPort {
    final List<String> events = new ArrayList<>();

    @Override
    public void processing(String videoId) {
      events.add("PROCESSING " + videoId);
    }

    @Override
    public void ready(TranscodeResult result) {
      events.add("READY " + result.videoId() + " " + result.outputKeys().size());
    }

    @Override
    public void failed(String videoId, String reason) {
      events.add("FAILED " + videoId + " " + reason);
    }
  }

  private static final class FakeTranscoder implements TranscoderPort {
    final VideoInfo info;
    final List<Rendition> transcoded = new ArrayList<>();
    String failOn;

    FakeTranscoder(VideoInfo info) {
      this.info = info;
    }

    @Override
    public VideoInfo probe(Path source) {
      return info;
    }

    // Two segments and a playlist, like ffmpeg's HLS muxer.
    @Override
    public void transcodeToHls(Path source, Rendition rendition, Path outputDir) {
      if (rendition.name().equals(failOn)) {
        throw new IllegalStateException("ffmpeg failed for " + rendition.name());
      }
      transcoded.add(rendition);
      try {
        Files.createDirectories(outputDir);
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
      write(outputDir.resolve("index.m3u8"), "#EXTM3U " + rendition.name());
      write(outputDir.resolve("seg_000.ts"), rendition.name() + "-0");
      write(outputDir.resolve("seg_001.ts"), rendition.name() + "-1");
    }
  }

  private static void write(Path target, String content) {
    try {
      Files.writeString(target, content);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
