package dev.ytclone.transcoder.adapter.out.ffmpeg;

import java.time.Duration;
import java.util.List;

public interface ProcessRunner {

  /** Runs to completion and returns the combined stdout and stderr. */
  Result run(Spec spec, Duration timeout);

  /** {@code onTimeout} runs after a timeout kill, e.g. to remove a container. */
  record Spec(List<String> command, List<String> onTimeout) {
    public Spec {
      command = List.copyOf(command);
      onTimeout = List.copyOf(onTimeout);
    }
  }

  record Result(int exitCode, String output) {}
}
