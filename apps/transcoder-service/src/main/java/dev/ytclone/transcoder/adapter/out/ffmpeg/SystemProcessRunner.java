package dev.ytclone.transcoder.adapter.out.ffmpeg;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public class SystemProcessRunner implements ProcessRunner {

  private static final Duration CLEANUP_TIMEOUT = Duration.ofSeconds(30);

  @Override
  public Result run(Spec spec, Duration timeout) {
    Path output = createOutputFile();
    try {
      // Output goes to a file, so a chatty process can never block on a full pipe.
      Process process =
          new ProcessBuilder(spec.command())
              .redirectErrorStream(true)
              .redirectOutput(output.toFile())
              .start();
      if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
        process.destroyForcibly().waitFor(CLEANUP_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
        runCleanup(spec);
        throw new FfmpegException(spec.command().getFirst() + " timed out after " + timeout);
      }
      return new Result(process.exitValue(), Files.readString(output, StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new FfmpegException(
          "Cannot run " + spec.command().getFirst() + ": " + e.getMessage(), e);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new FfmpegException("Interrupted while running " + spec.command().getFirst(), e);
    } finally {
      deleteQuietly(output);
    }
  }

  private void runCleanup(Spec spec) {
    if (spec.onTimeout().isEmpty()) {
      return;
    }
    try {
      Process cleanup = new ProcessBuilder(spec.onTimeout()).redirectErrorStream(true).start();
      cleanup.getInputStream().transferTo(java.io.OutputStream.nullOutputStream());
      cleanup.waitFor(CLEANUP_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
    } catch (IOException e) {
      log.warn("Cleanup {} failed: {}", spec.onTimeout(), e.getMessage());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private static Path createOutputFile() {
    try {
      return Files.createTempFile("yt-process-", ".log");
    } catch (IOException e) {
      throw new FfmpegException("Cannot create a process output file", e);
    }
  }

  private static void deleteQuietly(Path file) {
    try {
      Files.deleteIfExists(file);
    } catch (IOException e) {
      log.debug("Could not delete {}", file, e);
    }
  }
}
