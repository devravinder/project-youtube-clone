package dev.ytclone.transcoder.adapter.out.ffmpeg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.ytclone.transcoder.application.PermanentFailureException;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.VideoInfo;
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
  void probeReadsTheFirstVideoStreamSize() {
    next = new ProcessRunner.Result(0, "1920,1080\n");

    assertThat(withBinaries().probe(workRoot.resolve("job/source")))
        .isEqualTo(new VideoInfo(1920, 1080));

    List<String> command = specs.getFirst().command();
    assertThat(command.getFirst()).isEqualTo("/opt/ffprobe");
    assertThat(command)
        .containsSequence("-select_streams", "v:0")
        .containsSequence("-show_entries", "stream=width,height");
    assertThat(command.getLast()).isEqualTo(workRoot.resolve("job/source").toString());
    assertThat(timeouts).containsExactly(TIMEOUT);
  }

  @Test
  void probeFailsWhenThereIsNoVideoStream() {
    next = new ProcessRunner.Result(0, "\n");

    assertThatThrownBy(() -> withBinaries().probe(workRoot.resolve("job/song.mp3")))
        .isInstanceOf(UnprocessableMediaException.class)
        .hasMessageContaining("No video stream");
  }

  @Test
  void hlsScalesToTheRungWithItsBitrateAlignedKeyframesAndVodSegments() {
    Path out = workRoot.resolve("job/hls/720p");
    withBinaries()
        .transcodeToHls(workRoot.resolve("job/source"), new Rendition("720p", 720, 2800), out);

    List<String> command = specs.getFirst().command();
    assertThat(command.getFirst()).isEqualTo("/opt/ffmpeg");
    assertThat(command)
        .containsSequence("-vf", "scale=-2:720")
        .containsSequence("-c:v", "libx264")
        .containsSequence("-b:v", "2800k")
        .containsSequence("-maxrate", "4200k")
        .containsSequence("-bufsize", "5600k")
        .containsSequence("-map", "0:a:0?")
        .containsSequence("-force_key_frames", "expr:gte(t,n_forced*2)")
        .containsSequence("-sc_threshold", "0")
        .containsSequence("-f", "hls")
        .containsSequence("-hls_time", "4")
        .containsSequence("-hls_playlist_type", "vod")
        .containsSequence("-hls_segment_filename", out.resolve("seg_%03d.ts").toString());
    assertThat(command.getLast()).isEqualTo(out.resolve("index.m3u8").toString());
    // ffmpeg will not create the directory itself.
    assertThat(out).isDirectory();
  }

  @Test
  void dockerModeMapsPathsIntoTheMountAndRemovesTheContainerOnTimeout() {
    next = new ProcessRunner.Result(0, "854,480");

    withDocker().probe(workRoot.resolve("job-1/source"));

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
        .transcodeToHls(
            workRoot.resolve("j/source"),
            new Rendition("360p", 360, 800),
            workRoot.resolve("j/hls/360p"));

    assertThat(specs.getFirst().command())
        .containsSequence("--entrypoint", "/ffmpeg")
        .containsSequence("-i", "/work/j/source")
        .containsSequence("-hls_segment_filename", "/work/j/hls/360p/seg_%03d.ts")
        .endsWith("/work/j/hls/360p/index.m3u8");
  }

  @Test
  void dockerModeRefusesFilesOutsideTheMountedWorkRoot() {
    Path outside = workRoot.resolveSibling("elsewhere/source");

    assertThatThrownBy(() -> withDocker().probe(outside))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("outside the mounted work root");
    assertThat(specs).isEmpty();
  }

  @Test
  void aNonZeroExitFailsWithTheEndOfTheToolOutput() {
    next = new ProcessRunner.Result(1, "x".repeat(5000) + "\nInvalid data found\n");

    assertThatThrownBy(() ->
            withBinaries()
                .transcodeToHls(
                    workRoot.resolve("s"), new Rendition("360p", 360, 800), workRoot.resolve("o")))
        .isInstanceOf(UnprocessableMediaException.class)
        .hasMessageStartingWith("ffmpeg exited with 1: ...")
        .hasMessageEndingWith("Invalid data found")
        .satisfies(e -> assertThat(e.getMessage()).hasSizeLessThan(2100));
  }

  @Test
  void aKilledProcessIsTransientNotAProblemWithTheFile() {
    next = new ProcessRunner.Result(137, "Killed");

    assertThatThrownBy(() -> withBinaries().probe(workRoot.resolve("s")))
        .isInstanceOf(FfmpegException.class)
        .isNotInstanceOf(PermanentFailureException.class);
  }
}
