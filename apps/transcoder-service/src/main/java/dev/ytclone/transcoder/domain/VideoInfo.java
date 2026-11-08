package dev.ytclone.transcoder.domain;

public record VideoInfo(int width, int height) {

  public VideoInfo {
    if (width < 2 || height < 2) {
      throw new IllegalArgumentException("width and height must be at least 2");
    }
  }

  /** Width at the given height, rounded like ffmpeg's scale=-2: to the nearest even number. */
  public int widthAt(int targetHeight) {
    long half = Math.round((double) width * targetHeight / (height * 2.0));
    return (int) Math.max(2, half * 2);
  }
}
