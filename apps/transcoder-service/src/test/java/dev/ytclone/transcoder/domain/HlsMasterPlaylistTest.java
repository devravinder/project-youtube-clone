package dev.ytclone.transcoder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

class HlsMasterPlaylistTest {

  @Test
  void listsOneVariantPerRenditionWithBandwidthAndResolution() {
    String playlist =
        HlsMasterPlaylist.render(RenditionLadder.forSourceHeight(720), new VideoInfo(1280, 720));

    assertThat(playlist)
        .isEqualTo(
            """
            #EXTM3U
            #EXT-X-VERSION:3
            #EXT-X-STREAM-INF:BANDWIDTH=1328000,AVERAGE-BANDWIDTH=928000,RESOLUTION=640x360,NAME="360p"
            360p/index.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=2228000,AVERAGE-BANDWIDTH=1528000,RESOLUTION=854x480,NAME="480p"
            480p/index.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=4328000,AVERAGE-BANDWIDTH=2928000,RESOLUTION=1280x720,NAME="720p"
            720p/index.m3u8
            """);
  }

  @Test
  void keepsTheAspectRatioOfPortraitAndOddSources() {
    assertThat(new VideoInfo(1080, 1920).widthAt(360)).isEqualTo(202);
    assertThat(new VideoInfo(1920, 1180).widthAt(1080)).isEqualTo(1758);
    assertThat(
            HlsMasterPlaylist.render(
                List.of(new Rendition("360p", 360, 800)), new VideoInfo(1080, 1920)))
        .contains("RESOLUTION=202x360");
  }

  @Test
  void rejectsADegenerateSource() {
    assertThatThrownBy(() -> new VideoInfo(0, 720)).isInstanceOf(IllegalArgumentException.class);
  }
}
