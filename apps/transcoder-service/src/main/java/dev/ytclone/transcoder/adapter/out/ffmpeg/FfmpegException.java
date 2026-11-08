package dev.ytclone.transcoder.adapter.out.ffmpeg;

public class FfmpegException extends RuntimeException {

  public FfmpegException(String message) {
    super(message);
  }

  public FfmpegException(String message, Throwable cause) {
    super(message, cause);
  }
}
