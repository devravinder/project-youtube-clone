package dev.ytclone.transcoder.adapter.out.ffmpeg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.ytclone.transcoder.domain.Rendition;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// Real ffmpeg in the local image; skipped when Docker or the image is missing.
class FfmpegDockerIntegrationTest {

  private static final String IMAGE = "mwader/static-ffmpeg:latest";
  private static final Duration TIMEOUT = Duration.ofMinutes(2);

  @TempDir static Path workRoot;

  private static final SystemProcessRunner RUNNER = new SystemProcessRunner();
  private static FfmpegLauncher.Docker launcher;
  private static FfmpegTranscoder transcoder;
  private static Path source;

  @BeforeAll
  static void generateASourceVideo() throws Exception {
    assumeTrue(imageAvailable(), "Docker image " + IMAGE + " is not available");
    launcher = new FfmpegLauncher.Docker(IMAGE, workRoot);
    transcoder = new FfmpegTranscoder(RUNNER, launcher, TIMEOUT);
    source = workRoot.resolve("job/source");
    Files.createDirectories(source.getParent());
    // Two seconds of 854x480 test pattern plus a tone, written without an extension like real jobs.
    ProcessRunner.Result made =
        RUNNER.run(
            launcher.spec(
                FfmpegLauncher.Tool.FFMPEG,
                List.of(
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=854x480:rate=25",
                    "-f",
                    "lavfi",
                    "-i",
                    "sine=frequency=440",
                    "-t",
                    "2",
                    "-c:v",
                    "libx264",
                    "-c:a",
                    "aac",
                    "-f",
                    "mp4",
                    launcher.path(source))),
            TIMEOUT);
    assertThat(made.exitCode()).as(made.output()).isZero();
  }

  private static boolean imageAvailable() {
    try {
      return new ProcessBuilder("docker", "image", "inspect", IMAGE)
              .redirectErrorStream(true)
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .start()
              .waitFor()
          == 0;
    } catch (Exception e) {
      return false;
    }
  }

  @Test
  void probesTheSourceHeight() {
    assertThat(transcoder.probeHeight(source)).isEqualTo(480);
  }

  @Test
  void producesAPlayableRenditionAtTheRequestedHeight() throws Exception {
    Path target = workRoot.resolve("job/360p.mp4");

    transcoder.transcode(source, new Rendition("360p", 360, 800), target);

    assertThat(target).isNotEmptyFile();
    assertThat(transcoder.probeHeight(target)).isEqualTo(360);
    // faststart puts the moov index before the media data.
    String file = new String(Files.readAllBytes(target), StandardCharsets.ISO_8859_1);
    assertThat(file.indexOf("moov")).isNotNegative().isLessThan(file.indexOf("mdat"));
  }

  @Test
  void failsClearlyForAFileThatIsNotAVideo() throws Exception {
    Path junk = workRoot.resolve("job/junk");
    Files.writeString(junk, "not a video");

    assertThatThrownBy(() -> transcoder.probeHeight(junk))
        .isInstanceOf(UnprocessableMediaException.class)
        .hasMessageContaining("ffprobe exited with");
  }
}
