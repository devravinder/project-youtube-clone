package dev.ytclone.transcoder.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class RenditionLadderTest {

  static Stream<Arguments> ladders() {
    return Stream.of(
        Arguments.of(2160, List.of("360p", "480p", "720p", "1080p")),
        Arguments.of(1080, List.of("360p", "480p", "720p", "1080p")),
        Arguments.of(1079, List.of("360p", "480p", "720p")),
        Arguments.of(720, List.of("360p", "480p", "720p")),
        Arguments.of(480, List.of("360p", "480p")),
        Arguments.of(360, List.of("360p")));
  }

  @ParameterizedTest
  @MethodSource("ladders")
  void offersOnlyRenditionsUpToTheSourceHeight(int sourceHeight, List<String> expectedNames) {
    List<Rendition> ladder = RenditionLadder.forSourceHeight(sourceHeight);

    assertThat(ladder).extracting(Rendition::name).containsExactlyElementsOf(expectedNames);
    assertThat(ladder).allSatisfy(r -> assertThat(r.height()).isLessThanOrEqualTo(sourceHeight));
  }

  @Test
  void keepsTheSourceHeightWhenBelowTheSmallestRung() {
    assertThat(RenditionLadder.forSourceHeight(240))
        .singleElement()
        .satisfies(r -> {
          assertThat(r.name()).isEqualTo("240p");
          assertThat(r.height()).isEqualTo(240);
        });
  }

  @Test
  void roundsAnOddSourceHeightDownBecauseEncodersNeedEvenSizes() {
    assertThat(RenditionLadder.forSourceHeight(201))
        .singleElement()
        .satisfies(r -> assertThat(r.height()).isEqualTo(200));
  }

  @Test
  void bitrateGrowsWithHeight() {
    List<Rendition> ladder = RenditionLadder.forSourceHeight(1080);

    assertThat(ladder)
        .extracting(Rendition::videoBitrateKbps)
        .isSortedAccordingTo(Integer::compare)
        .doesNotHaveDuplicates();
  }

  @Test
  void rejectsAnUnusableSourceHeight() {
    assertThatThrownBy(() -> RenditionLadder.forSourceHeight(1))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> RenditionLadder.forSourceHeight(0))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> RenditionLadder.forSourceHeight(-720))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
