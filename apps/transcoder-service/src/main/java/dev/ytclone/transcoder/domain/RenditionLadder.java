package dev.ytclone.transcoder.domain;

import java.util.List;

public final class RenditionLadder {

  private static final List<Rendition> RUNGS =
      List.of(
          new Rendition("360p", 360, 800),
          new Rendition("480p", 480, 1400),
          new Rendition("720p", 720, 2800),
          new Rendition("1080p", 1080, 5000));

  private static final int LOWEST_BITRATE_KBPS = 400;

  private RenditionLadder() {}

  // Never upscales: rungs up to the source height, or one rendition at the source height.
  public static List<Rendition> forSourceHeight(int sourceHeight) {
    if (sourceHeight < 2) {
      throw new IllegalArgumentException("sourceHeight must be at least 2");
    }
    List<Rendition> fitting = RUNGS.stream().filter(r -> r.height() <= sourceHeight).toList();
    if (!fitting.isEmpty()) {
      return fitting;
    }
    int evenHeight = sourceHeight - (sourceHeight % 2);
    return List.of(new Rendition(evenHeight + "p", evenHeight, LOWEST_BITRATE_KBPS));
  }
}
