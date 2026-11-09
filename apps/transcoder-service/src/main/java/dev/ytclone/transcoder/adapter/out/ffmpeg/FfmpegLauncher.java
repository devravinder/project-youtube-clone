package dev.ytclone.transcoder.adapter.out.ffmpeg;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
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
  record Docker(String image, Path workRoot, String user) implements FfmpegLauncher {

    static final String MOUNT = "/work";

    public Docker {
      workRoot = workRoot.toAbsolutePath().normalize();
    }

    public Docker(String image, Path workRoot) {
      this(image, workRoot, null);
    }

    /** On Linux/macOS run as the work root's owner, so output files are not left owned by root. */
    public static Docker forCurrentUser(String image, Path workRoot) {
      try {
        Files.createDirectories(workRoot);
        Object uid = Files.getAttribute(workRoot, "unix:uid");
        Object gid = Files.getAttribute(workRoot, "unix:gid");
        return new Docker(image, workRoot, uid + ":" + gid);
      } catch (UnsupportedOperationException | IllegalArgumentException e) {
        // Windows: Docker Desktop maps file ownership itself.
        return new Docker(image, workRoot);
      } catch (IOException e) {
        throw new UncheckedIOException("Cannot prepare " + workRoot, e);
      }
    }

    @Override
    public ProcessRunner.Spec spec(Tool tool, List<String> args) {
      String name = "yt-ffmpeg-" + UUID.randomUUID();
      List<String> command = new ArrayList<>();
      command.addAll(List.of("docker", "run", "--rm", "--name", name));
      if (user != null) {
        command.addAll(List.of("--user", user));
      }
      command.addAll(
          List.of(
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
