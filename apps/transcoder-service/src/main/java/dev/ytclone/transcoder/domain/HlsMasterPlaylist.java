package dev.ytclone.transcoder.domain;

import java.util.List;

/** The master playlist lists one variant per rendition; players pick between them by bandwidth. */
public final class HlsMasterPlaylist {

  public static final String FILE_NAME = "master.m3u8";
  public static final String VARIANT_FILE_NAME = "index.m3u8";
  public static final int AUDIO_BITRATE_KBPS = 128;

  private HlsMasterPlaylist() {}

  public static String variantPath(Rendition rendition) {
    return rendition.name() + "/" + VARIANT_FILE_NAME;
  }

  // BANDWIDTH is the peak in bits/s; ffmpeg caps video at 1.5x its target via -maxrate.
  public static String render(List<Rendition> renditions, VideoInfo source) {
    StringBuilder out = new StringBuilder("#EXTM3U\n#EXT-X-VERSION:3\n");
    for (Rendition r : renditions) {
      long peak = (r.videoBitrateKbps() * 3L / 2 + AUDIO_BITRATE_KBPS) * 1000;
      out.append("#EXT-X-STREAM-INF:BANDWIDTH=")
          .append(peak)
          .append(",AVERAGE-BANDWIDTH=")
          .append((r.videoBitrateKbps() + AUDIO_BITRATE_KBPS) * 1000L)
          .append(",RESOLUTION=")
          .append(source.widthAt(r.height()))
          .append('x')
          .append(r.height())
          .append(",NAME=\"")
          .append(r.name())
          .append("\"\n")
          .append(variantPath(r))
          .append('\n');
    }
    return out.toString();
  }
}
