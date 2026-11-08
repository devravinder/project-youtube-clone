package dev.ytclone.transcoder.application.port.out;

import java.nio.file.Path;
import java.util.Optional;

public interface StoragePort {

  /** Throws PermanentFailureException when the object does not exist. */
  void download(String bucket, String key, Path target);

  void upload(String bucket, String key, Path source, String contentType);

  Optional<String> readText(String bucket, String key);

  void writeText(String bucket, String key, String text, String contentType);
}
