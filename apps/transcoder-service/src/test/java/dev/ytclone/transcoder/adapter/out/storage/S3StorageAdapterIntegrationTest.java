package dev.ytclone.transcoder.adapter.out.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.ytclone.transcoder.application.PermanentFailureException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

// Runs against the compose MinIO; skipped when it is not up.
class S3StorageAdapterIntegrationTest {

  private static final String ENDPOINT = "http://localhost:9000";
  private static final String BUCKET = "hls-videos";
  private static final String PREFIX = "it-" + UUID.randomUUID() + "/";

  private static S3Client client;
  private static S3StorageAdapter storage;

  @TempDir Path dir;

  @BeforeAll
  static void connect() {
    assumeTrue(minioIsUp(), "MinIO is not running on " + ENDPOINT);
    client = S3StorageAdapter.createClient(ENDPOINT, "us-east-1", "minioadmin", "minioadmin", true);
    storage = new S3StorageAdapter(client);
  }

  @AfterAll
  static void cleanUp() {
    if (client == null) {
      return;
    }
    client
        .listObjectsV2Paginator(r -> r.bucket(BUCKET).prefix(PREFIX))
        .contents()
        .forEach(o -> client.deleteObject(r -> r.bucket(BUCKET).key(o.key())));
    client.close();
  }

  private static boolean minioIsUp() {
    try (HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()) {
      HttpResponse<Void> response =
          http.send(
              HttpRequest.newBuilder(URI.create(ENDPOINT + "/minio/health/live")).build(),
              HttpResponse.BodyHandlers.discarding());
      return response.statusCode() == 200;
    } catch (Exception e) {
      return false;
    }
  }

  @Test
  void uploadsWithTheContentTypeAndDownloadsTheSameBytesOverAnExistingFile() throws Exception {
    Path source = dir.resolve("360p.mp4");
    byte[] bytes = new byte[300_000];
    new java.util.Random(7).nextBytes(bytes);
    Files.write(source, bytes);
    String key = PREFIX + "360p.mp4";

    storage.upload(BUCKET, key, source, "video/mp4");
    Path target = dir.resolve("nested/copy");
    Files.createDirectories(target.getParent());
    Files.writeString(target, "stale");
    storage.download(BUCKET, key, target);

    assertThat(Files.readAllBytes(target)).isEqualTo(bytes);
    assertThat(client.headObject(r -> r.bucket(BUCKET).key(key)).contentType())
        .isEqualTo("video/mp4");
  }

  @Test
  void downloadOfAMissingKeyFails() {
    assertThatThrownBy(() -> storage.download(BUCKET, PREFIX + "missing", dir.resolve("x")))
        .isInstanceOf(PermanentFailureException.class)
        .hasCauseInstanceOf(NoSuchKeyException.class);
  }

  @Test
  void writesAndReadsTextAndReportsMissingTextAsEmpty() {
    String key = PREFIX + "manifest.json";

    storage.writeText(BUCKET, key, "{\"a\":1}", "application/json");

    assertThat(storage.readText(BUCKET, key)).contains("{\"a\":1}");
    assertThat(storage.readText(BUCKET, PREFIX + "nothing-here")).isEmpty();
  }
}
