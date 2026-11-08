package dev.ytclone.transcoder.application.port.in;

/** Called once a job is given up on, so the video can be marked failed. */
public interface ReportTranscodeFailure {

  void reportFailure(String videoId, String reason);
}
