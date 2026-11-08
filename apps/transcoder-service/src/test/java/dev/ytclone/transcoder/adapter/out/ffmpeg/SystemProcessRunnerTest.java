package dev.ytclone.transcoder.adapter.out.ffmpeg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// Uses the running JVM's java binary, so it works on any OS.
class SystemProcessRunnerTest {

  private static final String JAVA = ProcessHandle.current().info().command().orElseThrow();
  private static final Duration LONG = Duration.ofMinutes(1);

  private final SystemProcessRunner runner = new SystemProcessRunner();

  @TempDir Path dir;

  private Path script(String name, String body) throws Exception {
    Path file = dir.resolve(name + ".java");
    Files.writeString(
        file,
        "class "
            + name
            + " { public static void main(String[] a) throws Exception { "
            + body
            + " } }");
    return file;
  }

  @Test
  void returnsTheExitCodeAndCombinedOutput() throws Exception {
    Path hello = script("Hello", "System.out.println(\"out\"); System.err.println(\"err\");");

    ProcessRunner.Result result =
        runner.run(new ProcessRunner.Spec(List.of(JAVA, hello.toString()), List.of()), LONG);

    assertThat(result.exitCode()).isZero();
    assertThat(result.output()).contains("out").contains("err");
  }

  @Test
  void reportsANonZeroExit() throws Exception {
    Path fail = script("Fail", "System.exit(3);");

    ProcessRunner.Result result =
        runner.run(new ProcessRunner.Spec(List.of(JAVA, fail.toString()), List.of()), LONG);

    assertThat(result.exitCode()).isEqualTo(3);
  }

  @Test
  void killsAProcessThatTimesOutAndRunsItsCleanup() throws Exception {
    Path sleep = script("Sleep", "Thread.sleep(60_000);");
    Path marker = dir.resolve("cleaned");
    Path touch =
        script("Touch", "java.nio.file.Files.writeString(java.nio.file.Path.of(a[0]), \"x\");");

    long started = System.nanoTime();
    assertThatThrownBy(() ->
            runner.run(
                new ProcessRunner.Spec(
                    List.of(JAVA, sleep.toString()),
                    List.of(JAVA, touch.toString(), marker.toString())),
                Duration.ofSeconds(3)))
        .isInstanceOf(FfmpegException.class)
        .hasMessageContaining("timed out");

    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(40));
    assertThat(marker).exists();
  }

  @Test
  void explainsAMissingBinary() {
    assertThatThrownBy(() ->
            runner.run(new ProcessRunner.Spec(List.of("yt-no-such-binary-42"), List.of()), LONG))
        .isInstanceOf(FfmpegException.class)
        .hasMessageContaining("Cannot run yt-no-such-binary-42");
  }
}
