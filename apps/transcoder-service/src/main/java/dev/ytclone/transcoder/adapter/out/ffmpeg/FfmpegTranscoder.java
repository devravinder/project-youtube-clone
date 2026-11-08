package dev.ytclone.transcoder.adapter.out.ffmpeg;

import dev.ytclone.transcoder.adapter.out.ffmpeg.FfmpegLauncher.Tool;
import dev.ytclone.transcoder.application.port.out.TranscoderPort;
import dev.ytclone.transcoder.domain.HlsMasterPlaylist;
import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.VideoInfo;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@RequiredArgsConstructor
public class FfmpegTranscoder implements TranscoderPort {

  private static final int SEGMENT_SECONDS = 4;
  private static final int KEYFRAME_SECONDS = 2;
  private static final int MAX_OUTPUT_IN_ERRORS = 2000;

  private final ProcessRunner runner;
  private final FfmpegLauncher launcher;
  private final Duration timeout;

  @Override
  public VideoInfo probe(Path source) {
    String output =
        run(
            Tool.FFPROBE,
            List.of(
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0",
                launcher.path(source)));
    return output
        .lines()
        .map(String::trim)
        .filter(line -> line.matches("\\d+,\\d+"))
        .findFirst()
        .map(line -> line.split(","))
        .map(wh -> new VideoInfo(Integer.parseInt(wh[0]), Integer.parseInt(wh[1])))
        .orElseThrow(() ->
            new UnprocessableMediaException("No video stream found in " + source.getFileName()));
  }

  @Override
  public void transcodeToHls(Path source, Rendition rendition, Path outputDir) {
    try {
      // The HLS muxer does not create directories; in Docker mode this is the mounted host path.
      Files.createDirectories(outputDir);
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot create " + outputDir, e);
    }
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
            // A keyframe every 2 s in every rendition, so players can switch at segment edges.
            "-force_key_frames",
            "expr:gte(t,n_forced*" + KEYFRAME_SECONDS + ")",
            "-sc_threshold",
            "0",
            "-b:v",
            bitrate + "k",
            "-maxrate",
            (bitrate * 3 / 2) + "k",
            "-bufsize",
            (bitrate * 2) + "k",
            "-c:a",
            "aac",
            "-b:a",
            HlsMasterPlaylist.AUDIO_BITRATE_KBPS + "k",
            "-ac",
            "2",
            "-f",
            "hls",
            "-hls_time",
            String.valueOf(SEGMENT_SECONDS),
            "-hls_playlist_type",
            "vod",
            "-hls_segment_filename",
            launcher.path(outputDir.resolve("seg_%03d.ts")),
            launcher.path(outputDir.resolve(HlsMasterPlaylist.VARIANT_FILE_NAME))));
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
