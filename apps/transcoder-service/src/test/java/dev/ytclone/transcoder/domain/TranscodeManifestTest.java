package dev.ytclone.transcoder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TranscodeManifestTest {

  @Test
  void roundTripsAResult() {
    TranscodeResult result =
        new TranscodeResult(
            "vid-1",
            "vid-1/hls/master.m3u8",
            List.of("vid-1/hls/360p/index.m3u8", "vid-1/hls/480p/index.m3u8"));

    assertThat(TranscodeManifest.fromJson(TranscodeManifest.toJson(result))).contains(result);
  }

  @Test
  void readsAManifestWithWhitespaceAndNoRenditions() {
    assertThat(
            TranscodeManifest.fromJson(
                "{ \"videoId\" : \"v\", \"masterPlaylist\" : \"m\", \"renditions\" : [ ] }"))
        .contains(new TranscodeResult("v", "m", List.of()));
  }

  @Test
  void treatsAManifestFromBeforeHlsAsMissing() {
    assertThat(TranscodeManifest.fromJson("{\"videoId\":\"v\",\"renditions\":[\"v/360p.mp4\"]}"))
        .isEmpty();
  }

  @Test
  void rejectsSomethingThatIsNotAManifest() {
    assertThat(TranscodeManifest.fromJson("{\"hello\":1}")).isEmpty();
  }

  @Test
  void keyLivesNextToTheRenditions() {
    assertThat(TranscodeManifest.key("vid-1")).isEqualTo("vid-1/manifest.json");
  }
}
