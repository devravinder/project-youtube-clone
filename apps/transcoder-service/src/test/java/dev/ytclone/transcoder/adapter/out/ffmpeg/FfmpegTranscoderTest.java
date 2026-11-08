package dev.ytclone.transcoder.adapter.out.ffmpeg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.domain.Rendition;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class FfmpegTranscoderTest {

  private static final Duration TIMEOUT = Duration.ofMinutes(5);

  private final List<ProcessRunner.Spec> specs = new ArrayList<>();
  private final List<Duration> timeouts = new ArrayList<>();
  private ProcessRunner.Result next = new ProcessRunner.Result(0, "");

  private final ProcessRunner fakeRunner =
      (spec, timeout) -> {
        specs.add(spec);
        timeouts.add(timeout);
        return next;
      };

  private final Path workRoot = Path.of("build", "ff-work").toAbsolutePath();

  private FfmpegTranscoder withBinaries() {
    return new FfmpegTranscoder(
        fakeRunner, new FfmpegLauncher.Binaries("/opt/ffmpeg", "/opt/ffprobe"), TIMEOUT);
  }

  private FfmpegTranscoder withDocker() {
    return new FfmpegTranscoder(
        fakeRunner, new FfmpegLauncher.Docker("ffmpeg-image:1", workRoot), TIMEOUT);
  }

  @Test
  void probeReadsTheFirstVideoStreamHeight() {
    next = new ProcessRunner.Result(0, "1080\n");

    assertThat(withBinaries().probeHeight(workRoot.resolve("job/source"))).isEqualTo(1080);

    List<String> command = specs.getFirst().command();
    assertThat(command.getFirst()).isEqualTo("/opt/ffprobe");
    assertThat(command).containsSequence("-select_streams", "v:0");
    assertThat(command.getLast()).isEqualTo(workRoot.resolve("job/source").toString());
    assertThat(timeouts).containsExactly(TIMEOUT);
  }

  @Test
  void probeFailsWhenThereIsNoVideoStream() {
    next = new ProcessRunner.Result(0, "\n");

    assertThatThrownBy(() -> withBinaries().probeHeight(workRoot.resolve("job/song.mp3")))
        .isInstanceOf(FfmpegException.class)
        .hasMessageContaining("No video stream");
  }

  @Test
  void transcodeScalesToTheRungHeightWithItsBitrateAndFaststart() {
    withBinaries()
        .transcode(
            workRoot.resolve("job/source"),
            new Rendition("720p", 720, 2800),
            workRoot.resolve("job/720p.mp4"));

    List<String> command = specs.getFirst().command();
    assertThat(command.getFirst()).isEqualTo("/opt/ffmpeg");
    assertThat(command)
        .containsSequence("-vf", "scale=-2:720")
        .containsSequence("-c:v", "libx264")
        .containsSequence("-b:v", "2800k")
        .containsSequence("-maxrate", "4200k")
        .containsSequence("-bufsize", "5600k")
        .containsSequence("-map", "0:a:0?")
        .containsSequence("-movflags", "+faststart");
    assertThat(command.getLast()).isEqualTo(workRoot.resolve("job/720p.mp4").toString());
  }

  @Test
  void dockerModeMapsPathsIntoTheMountAndRemovesTheContainerOnTimeout() {
    next = new ProcessRunner.Result(0, "480");

    withDocker().probeHeight(workRoot.resolve("job-1/source"));

    ProcessRunner.Spec spec = specs.getFirst();
    assertThat(spec.command())
        .startsWith("docker", "run", "--rm", "--name")
        .containsSequence("-v", workRoot.normalize() + ":/work")
        .containsSequence("--entrypoint", "/ffprobe", "ffmpeg-image:1");
    assertThat(spec.command().getLast()).isEqualTo("/work/job-1/source");
    String name = spec.command().get(spec.command().indexOf("--name") + 1);
    assertThat(name).startsWith("yt-ffmpeg-");
    assertThat(spec.onTimeout()).containsExactly("docker", "rm", "-f", name);
  }

  @Test
  void dockerModeUsesTheFfmpegEntrypointForTranscodes() {
    withDocker()
        .transcode(
            workRoot.resolve("j/source"),
            new Rendition("360p", 360, 800),
            workRoot.resolve("j/360p.mp4"));

    assertThat(specs.getFirst().command())
        .containsSequence("--entrypoint", "/ffmpeg")
        .containsSequence("-i", "/work/j/source")
        .endsWith("/work/j/360p.mp4");
  }

  @Test
  void dockerModeRefusesFilesOutsideTheMountedWorkRoot() {
    Path outside = workRoot.resolveSibling("elsewhere/source");

    assertThatThrownBy(() -> withDocker().probeHeight(outside))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("outside the mounted work root");
    assertThat(specs).isEmpty();
  }

  @Test
  void aNonZeroExitFailsWithTheEndOfTheToolOutput() {
    next = new ProcessRunner.Result(1, "x".repeat(5000) + "\nInvalid data found\n");

    assertThatThrownBy(() ->
            withBinaries()
                .transcode(
                    workRoot.resolve("s"),
                    new Rendition("360p", 360, 800),
                    workRoot.resolve("o.mp4")))
        .isInstanceOf(FfmpegException.class)
        .hasMessageStartingWith("ffmpeg exited with 1: ...")
        .hasMessageEndingWith("Invalid data found")
        .satisfies(e -> assertThat(e.getMessage()).hasSizeLessThan(2100));
  }
}
