package dev.ytclone.transcoder.adapter.out.storage;

import dev.ytclone.transcoder.application.PermanentFailureException;
import dev.ytclone.transcoder.application.port.out.StoragePort;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.sync.ResponseTransformer;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;

// Serves MinIO and S3; only config differs.
@RequiredArgsConstructor
public class S3StorageAdapter implements StoragePort {

  private final S3Client client;

  public static S3Client createClient(
      String endpoint, String region, String accessKey, String secretKey, boolean pathStyle) {
    return S3Client.builder()
        .endpointOverride(URI.create(endpoint))
        .region(Region.of(region))
        .forcePathStyle(pathStyle)
        .credentialsProvider(
            StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
        // Same as the upload-service: default checksums are not needed and older MinIO rejects
        // some.
        .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
        .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
        .build();
  }

  @Override
  public void download(String bucket, String key, Path target) {
    try {
      Files.createDirectories(target.toAbsolutePath().getParent());
      // toFile refuses to overwrite.
      Files.deleteIfExists(target);
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot prepare " + target, e);
    }
    try {
      client.getObject(r -> r.bucket(bucket).key(key), ResponseTransformer.toFile(target));
    } catch (NoSuchKeyException e) {
      throw new PermanentFailureException("Source " + bucket + "/" + key + " does not exist", e);
    }
  }

  @Override
  public Optional<String> readText(String bucket, String key) {
    try {
      return Optional.of(client.getObjectAsBytes(r -> r.bucket(bucket).key(key)).asUtf8String());
    } catch (NoSuchKeyException e) {
      return Optional.empty();
    }
  }

  @Override
  public void writeText(String bucket, String key, String text, String contentType) {
    client.putObject(
        r -> r.bucket(bucket).key(key).contentType(contentType),
        RequestBody.fromString(text, StandardCharsets.UTF_8));
  }

  @Override
  public void upload(String bucket, String key, Path source, String contentType) {
    client.putObject(
        r -> r.bucket(bucket).key(key).contentType(contentType), RequestBody.fromFile(source));
  }
}
