package dev.ytclone.transcoder.adapter.out.ffmpeg;

import dev.ytclone.transcoder.application.PermanentFailureException;

/** ffmpeg or ffprobe rejected the file itself, so the same input will fail again. */
public class UnprocessableMediaException extends PermanentFailureException {

  public UnprocessableMediaException(String message) {
    super(message);
  }
}
