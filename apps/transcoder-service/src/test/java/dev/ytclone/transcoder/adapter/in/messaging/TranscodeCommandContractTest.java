package dev.ytclone.transcoder.adapter.in.messaging;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

// upload-service generates the schema from Zod; this keeps the Java record in step with it.
class TranscodeCommandContractTest {

  private static final Path SCHEMA = Path.of("../../contracts/transcode-command.schema.json");

  private static Set<String> recordFields() {
    return Arrays.stream(TranscodeCommandMessage.class.getRecordComponents())
        .map(component -> component.getName())
        .collect(Collectors.toSet());
  }

  @Test
  void recordHasExactlyTheSchemaPropertiesAndAllAreRequired() throws Exception {
    JsonNode schema = JsonMapper.builder().build().readTree(Files.readString(SCHEMA));

    assertThat(schema.get("properties").propertyNames())
        .containsExactlyInAnyOrderElementsOf(recordFields());
    List<String> required = schema.get("required").valueStream().map(JsonNode::asString).toList();
    assertThat(required).containsExactlyInAnyOrderElementsOf(recordFields());
  }

  @Test
  void convertsAPublishedJsonBodyIntoTheRecord() {
    String body =
        """
        {"messageId":"6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
         "videoId":"0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
         "sourceBucket":"raw-videos",
         "sourceKey":"0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d/source.mp4",
         "contentType":"video/mp4",
         "requestedAt":"2026-11-08T10:00:00.000Z"}
        """;
    MessageProperties properties = new MessageProperties();
    properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
    // The Node publisher sends no __TypeId__ header; the listener's parameter type decides.
    properties.setInferredArgumentType(TranscodeCommandMessage.class);

    Object converted =
        new JacksonJsonMessageConverter()
            .fromMessage(new Message(body.getBytes(StandardCharsets.UTF_8), properties));

    assertThat(converted)
        .isEqualTo(
            new TranscodeCommandMessage(
                "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
                "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
                "raw-videos",
                "0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d/source.mp4",
                "video/mp4",
                Instant.parse("2026-11-08T10:00:00Z")));
  }
}
