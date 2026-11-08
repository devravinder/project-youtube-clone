package dev.ytclone.transcoder.adapter.out.ffmpeg;

import dev.ytclone.transcoder.adapter.out.ffmpeg.FfmpegLauncher.Tool;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.domain.Rendition;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class FfmpegTranscoder implements TranscoderPort {

  private static final int AUDIO_BITRATE_KBPS = 128;
  private static final int MAX_OUTPUT_IN_ERRORS = 2000;

  private final ProcessRunner runner;
  private final FfmpegLauncher launcher;
  private final Duration timeout;

  @Override
  public int probeHeight(Path source) {
    String output =
        run(
            Tool.FFPROBE,
            List.of(
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=height",
                "-of",
                "csv=p=0",
                launcher.path(source)));
    return output
        .lines()
        .map(String::trim)
        .filter(line -> line.matches("\\d+"))
        .findFirst()
        .map(Integer::parseInt)
        .orElseThrow(() ->
            new UnprocessableMediaException("No video stream found in " + source.getFileName()));
  }

  @Override
  public void transcode(Path source, Rendition rendition, Path target) {
    int bitrate = rendition.videoBitrateKbps();
    long started = System.nanoTime();
    run(
        Tool.FFMPEG,
        List.of(
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-i",
            launcher.path(source),
            "-map",
            "0:v:0",
            // The trailing ? keeps silent videos working.
            "-map",
            "0:a:0?",
            // -2 keeps the aspect ratio with an even width, which H.264 needs.
            "-vf",
            "scale=-2:" + rendition.height(),
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-b:v",
            bitrate + "k",
            "-maxrate",
            (bitrate * 3 / 2) + "k",
            "-bufsize",
            (bitrate * 2) + "k",
            "-c:a",
            "aac",
            "-b:a",
            AUDIO_BITRATE_KBPS + "k",
            "-ac",
            "2",
            // Moves the index to the front so browsers can start playing before the download ends.
            "-movflags",
            "+faststart",
            launcher.path(target)));
    log.debug(
        "Rendition {} took {} ms",
        rendition.name(),
        Duration.ofNanos(System.nanoTime() - started).toMillis());
  }

  private String run(Tool tool, List<String> args) {
    ProcessRunner.Result result = runner.run(launcher.spec(tool, args), timeout);
    if (result.exitCode() != 0) {
      String message =
          "%s exited with %d: %s"
              .formatted(tool.name().toLowerCase(), result.exitCode(), tail(result.output()));
      // 137/143: killed (out of memory, container stopped) rather than rejected the input.
      if (result.exitCode() == 137 || result.exitCode() == 143) {
        throw new FfmpegException(message);
      }
      throw new UnprocessableMediaException(message);
    }
    return result.output();
  }

  private static String tail(String output) {
    String trimmed = output.strip();
    return trimmed.length() <= MAX_OUTPUT_IN_ERRORS
        ? trimmed
        : "..." + trimmed.substring(trimmed.length() - MAX_OUTPUT_IN_ERRORS);
  }
}
