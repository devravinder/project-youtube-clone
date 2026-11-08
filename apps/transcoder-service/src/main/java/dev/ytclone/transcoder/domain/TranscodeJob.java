package dev.ytclone.transcoder.domain;

public record TranscodeJob(String videoId, String sourceBucket, String sourceKey) {

  public TranscodeJob {
    requireText(videoId, "videoId");
    requireText(sourceBucket, "sourceBucket");
    requireText(sourceKey, "sourceKey");
  }

  private static void requireText(String value, String name) {
    if (value == null || value.isBlank()) {
      throw new IllegalArgumentException(name + " must not be blank");
    }
  }
}
