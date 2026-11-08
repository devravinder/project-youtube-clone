package dev.ytclone.transcoder.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class TranscodeManifestTest {

  @Test
  void roundTripsAResult() {
    TranscodeResult result =
        new TranscodeResult("vid-1", List.of("vid-1/360p.mp4", "vid-1/480p.mp4"));

    assertThat(TranscodeManifest.fromJson(TranscodeManifest.toJson(result))).contains(result);
  }

  @Test
  void readsAManifestWithWhitespaceAndNoRenditions() {
    assertThat(TranscodeManifest.fromJson("{ \"videoId\" : \"v\", \"renditions\" : [ ] }"))
        .contains(new TranscodeResult("v", List.of()));
  }

  @Test
  void rejectsSomethingThatIsNotAManifest() {
    assertThat(TranscodeManifest.fromJson("{\"hello\":1}")).isEmpty();
    assertThat(TranscodeManifest.fromJson("{\"videoId\":\"v\"}")).isEmpty();
  }

  @Test
  void keyLivesNextToTheRenditions() {
    assertThat(TranscodeManifest.key("vid-1")).isEqualTo("vid-1/manifest.json");
  }
}
