package dev.ytclone.transcoder.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.application.port.out.StoragePort;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.application.service.TranscodeService;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class TranscodeServiceTest {

  private static final TranscodeJob JOB =
      new TranscodeJob("vid-1", "raw-videos", "vid-1/source.mp4");

  @TempDir Path workRoot;

  private FakeStorage storage;
  private FakeTranscoder transcoder;
  private TranscodeService service;

  @BeforeEach
  void setUp() {
    storage = new FakeStorage();
    transcoder = new FakeTranscoder(1080);
    service = new TranscodeService(storage, transcoder, workRoot, "renditions");
  }

  @Test
  void downloadsTheSourceAndUploadsEveryRendition() {
    TranscodeResult result = service.transcode(JOB);

    assertThat(storage.downloads).containsExactly("raw-videos/vid-1/source.mp4");
    assertThat(storage.uploads)
        .containsExactly(
            "renditions/vid-1/360p.mp4",
            "renditions/vid-1/480p.mp4",
            "renditions/vid-1/720p.mp4",
            "renditions/vid-1/1080p.mp4");
    assertThat(result.videoId()).isEqualTo("vid-1");
    assertThat(result.outputKeys())
        .containsExactly("vid-1/360p.mp4", "vid-1/480p.mp4", "vid-1/720p.mp4", "vid-1/1080p.mp4");
  }

  @Test
  void neverUpscalesASmallSource() {
    transcoder = new FakeTranscoder(480);
    service = new TranscodeService(storage, transcoder, workRoot, "renditions");

    TranscodeResult result = service.transcode(JOB);

    assertThat(result.outputKeys()).containsExactly("vid-1/360p.mp4", "vid-1/480p.mp4");
    assertThat(transcoder.transcoded).extracting(Rendition::height).containsExactly(360, 480);
  }

  @Test
  void uploadsTheBytesTheTranscoderProduced() {
    service.transcode(JOB);

    assertThat(storage.uploadedContent).containsEntry("renditions/vid-1/720p.mp4", "encoded-720p");
    assertThat(storage.contentTypes).containsOnly("video/mp4");
  }

  @Test
  void removesItsWorkDirectoryAfterSuccess() {
    service.transcode(JOB);

    assertThat(listWorkRoot()).isEmpty();
  }

  @Test
  void removesItsWorkDirectoryAndStopsWhenTranscodingFails() {
    transcoder.failOn = "720p";

    assertThatThrownBy(() -> service.transcode(JOB)).hasMessage("ffmpeg failed for 720p");

    assertThat(listWorkRoot()).isEmpty();
    assertThat(storage.uploads)
        .containsExactly("renditions/vid-1/360p.mp4", "renditions/vid-1/480p.mp4");
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
        new TranscodeService(storage, transcoder, file.resolve("nested"), "renditions");

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
    final List<String> contentTypes = new ArrayList<>();
    final java.util.Map<String, String> uploadedContent = new java.util.HashMap<>();
    boolean failDownload;

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
      contentTypes.add(contentType);
      try {
        uploadedContent.put(bucket + "/" + key, Files.readString(source));
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
    }
  }

  private static final class FakeTranscoder implements TranscoderPort {
    final int sourceHeight;
    final List<Rendition> transcoded = new ArrayList<>();
    String failOn;

    FakeTranscoder(int sourceHeight) {
      this.sourceHeight = sourceHeight;
    }

    @Override
    public int probeHeight(Path source) {
      return sourceHeight;
    }

    @Override
    public void transcode(Path source, Rendition rendition, Path target) {
      if (rendition.name().equals(failOn)) {
        throw new IllegalStateException("ffmpeg failed for " + rendition.name());
      }
      transcoded.add(rendition);
      write(target, "encoded-" + rendition.name());
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
