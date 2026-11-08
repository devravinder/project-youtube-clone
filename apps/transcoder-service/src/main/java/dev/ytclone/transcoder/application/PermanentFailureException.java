package dev.ytclone.transcoder.application;

/** Retrying cannot help (bad input, missing source); the command goes straight to the DLQ. */
public class PermanentFailureException extends RuntimeException {

  public PermanentFailureException(String message) {
    super(message);
  }

  public PermanentFailureException(String message, Throwable cause) {
    super(message, cause);
  }
}
