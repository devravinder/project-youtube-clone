package dev.ytclone.transcoder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class DomainValidationTest {

  @ParameterizedTest
  @NullSource
  @ValueSource(strings = {"", "   "})
  void jobRejectsBlankFields(String blank) {
    assertThatThrownBy(() -> new TranscodeJob(blank, "raw", "key")).hasMessageContaining("videoId");
    assertThatThrownBy(() -> new TranscodeJob("id", blank, "key"))
        .hasMessageContaining("sourceBucket");
    assertThatThrownBy(() -> new TranscodeJob("id", "raw", blank))
        .hasMessageContaining("sourceKey");
  }

  @Test
  void jobKeepsItsValues() {
    TranscodeJob job = new TranscodeJob("id", "raw", "id/source.mp4");

    assertThat(job)
        .extracting(TranscodeJob::videoId, TranscodeJob::sourceBucket, TranscodeJob::sourceKey)
        .containsExactly("id", "raw", "id/source.mp4");
  }

  @Test
  void renditionRejectsInvalidValues() {
    assertThatThrownBy(() -> new Rendition(" ", 720, 2800)).hasMessageContaining("name");
    assertThatThrownBy(() -> new Rendition("x", 721, 2800)).hasMessageContaining("height");
    assertThatThrownBy(() -> new Rendition("x", 0, 2800)).hasMessageContaining("height");
    assertThatThrownBy(() -> new Rendition("x", 720, 0)).hasMessageContaining("videoBitrateKbps");
  }

  @Test
  void resultCopiesItsKeysSoLaterChangesCannotLeakIn() {
    List<String> keys = new ArrayList<>(List.of("a.mp4"));
    TranscodeResult result = new TranscodeResult("id", keys);

    keys.add("b.mp4");

    assertThat(result.outputKeys()).containsExactly("a.mp4");
    assertThatThrownBy(() -> result.outputKeys().add("c.mp4"))
        .isInstanceOf(UnsupportedOperationException.class);
  }
}
