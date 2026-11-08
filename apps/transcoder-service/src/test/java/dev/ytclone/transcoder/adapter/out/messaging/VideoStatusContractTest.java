package dev.ytclone.transcoder.adapter.out.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import dev.ytclone.transcoder.domain.TranscodeResult;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// upload-service validates these events with the Zod schema behind this file.
class VideoStatusContractTest {

  private static final Path SCHEMA = Path.of("../../contracts/video-status.schema.json");
  private static final JsonMapper JSON = JsonMapper.builder().build();
  private static final Clock CLOCK =
      Clock.fixed(Instant.parse("2026-11-08T10:00:00Z"), ZoneOffset.UTC);

  private final List<VideoStatusMessage> sent = new ArrayList<>();
  private final RabbitVideoStatusPublisher publisher =
      new RabbitVideoStatusPublisher(sent::add, CLOCK);

  private static Set<String> names(Class<? extends Record> type) {
    return Arrays.stream(type.getRecordComponents())
        .map(c -> c.getName())
        .collect(Collectors.toSet());
  }

  private static JsonNode wire(VideoStatusMessage message) throws Exception {
    byte[] body =
        new JacksonJsonMessageConverter().toMessage(message, new MessageProperties()).getBody();
    return JSON.readTree(new String(body, StandardCharsets.UTF_8));
  }

  @Test
  void recordsMatchTheSchemaPropertiesAndAllAreRequired() throws Exception {
    JsonNode schema = JSON.readTree(Files.readString(SCHEMA));

    assertThat(schema.get("properties").propertyNames())
        .containsExactlyInAnyOrderElementsOf(names(VideoStatusMessage.class));
    assertThat(schema.get("required").valueStream().map(JsonNode::asString).toList())
        .containsExactlyInAnyOrderElementsOf(names(VideoStatusMessage.class));
    JsonNode item = schema.get("properties").get("renditions").get("items");
    assertThat(item.get("properties").propertyNames())
        .containsExactlyInAnyOrderElementsOf(names(VideoStatusMessage.Rendition.class));
    assertThat(
            schema
                .get("properties")
                .get("status")
                .get("enum")
                .valueStream()
                .map(JsonNode::asString))
        .containsExactly("PROCESSING", "READY", "FAILED");
  }

  @Test
  void readyListsEachRenditionByNameAndKey() throws Exception {
    publisher.ready(
        new TranscodeResult(
            "vid-1",
            "vid-1/hls/master.m3u8",
            List.of("vid-1/hls/360p/index.m3u8", "vid-1/hls/720p/index.m3u8")));

    JsonNode json = wire(sent.getFirst());
    assertThat(json.get("status").asString()).isEqualTo("READY");
    assertThat(json.get("renditions").toString())
        .isEqualTo(
            "[{\"name\":\"360p\",\"key\":\"vid-1/hls/360p/index.m3u8\"},"
                + "{\"name\":\"720p\",\"key\":\"vid-1/hls/720p/index.m3u8\"}]");
    assertThat(json.get("masterPlaylist").asString()).isEqualTo("vid-1/hls/master.m3u8");
    assertThat(json.get("reason").isNull()).isTrue();
    // Zod's z.iso.datetime() wants an ISO string in UTC, not epoch numbers.
    assertThat(json.get("occurredAt").asString()).isEqualTo("2026-11-08T10:00:00Z");
    assertThat(json.get("messageId").asString()).hasSize(36);
  }

  @Test
  void processingAndFailedCarryNoRenditions() throws Exception {
    publisher.processing("vid-2");
    publisher.failed("vid-2", "not a video");

    assertThat(wire(sent.get(0)).get("renditions").isEmpty()).isTrue();
    assertThat(wire(sent.get(0)).get("masterPlaylist").isNull()).isTrue();
    JsonNode failed = wire(sent.get(1));
    assertThat(failed.get("status").asString()).isEqualTo("FAILED");
    assertThat(failed.get("reason").asString()).isEqualTo("not a video");
    assertThat(sent.get(0).messageId()).isNotEqualTo(sent.get(1).messageId());
  }

  @Test
  void renditionNameIsTheVariantDirectory() {
    assertThat(RabbitVideoStatusPublisher.renditionName("v/hls/1080p/index.m3u8"))
        .isEqualTo("1080p");
  }
}
