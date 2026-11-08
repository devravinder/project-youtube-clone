package dev.ytclone.transcoder.adapter.out.ffmpeg;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Decides how ffmpeg and ffprobe run: installed binaries, or a container per call. */
public sealed interface FfmpegLauncher {

  enum Tool {
    FFMPEG,
    FFPROBE
  }

  ProcessRunner.Spec spec(Tool tool, List<String> args);

  /** The path as the tool sees it. */
  String path(Path file);

  record Binaries(String ffmpegPath, String ffprobePath) implements FfmpegLauncher {

    @Override
    public ProcessRunner.Spec spec(Tool tool, List<String> args) {
      List<String> command = new ArrayList<>();
      command.add(tool == Tool.FFMPEG ? ffmpegPath : ffprobePath);
      command.addAll(args);
      return new ProcessRunner.Spec(command, List.of());
    }

    @Override
    public String path(Path file) {
      return file.toAbsolutePath().toString();
    }
  }

  /** Mounts the work root at /work; the image needs /ffmpeg and /ffprobe (mwader/static-ffmpeg). */
  record Docker(String image, Path workRoot) implements FfmpegLauncher {

    static final String MOUNT = "/work";

    public Docker {
      workRoot = workRoot.toAbsolutePath().normalize();
    }

    @Override
    public ProcessRunner.Spec spec(Tool tool, List<String> args) {
      String name = "yt-ffmpeg-" + UUID.randomUUID();
      List<String> command = new ArrayList<>();
      command.addAll(
          List.of(
              "docker",
              "run",
              "--rm",
              "--name",
              name,
              "-v",
              workRoot + ":" + MOUNT,
              "--entrypoint",
              tool == Tool.FFMPEG ? "/ffmpeg" : "/ffprobe",
              image));
      command.addAll(args);
      // Killing the docker client does not stop the container.
      return new ProcessRunner.Spec(command, List.of("docker", "rm", "-f", name));
    }

    @Override
    public String path(Path file) {
      Path absolute = file.toAbsolutePath().normalize();
      if (!absolute.startsWith(workRoot)) {
        throw new IllegalArgumentException(file + " is outside the mounted work root " + workRoot);
      }
      String relative = workRoot.relativize(absolute).toString().replace('\\', '/');
      return relative.isEmpty() ? MOUNT : MOUNT + "/" + relative;
    }
  }
}
