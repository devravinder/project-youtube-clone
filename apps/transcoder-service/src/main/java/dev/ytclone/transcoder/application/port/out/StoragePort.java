package dev.ytclone.transcoder.application.port.out;

import java.nio.file.Path;

public interface StoragePort {

    void download(String bucket, String key, Path target);

    void upload(String bucket, String key, Path source, String contentType);
}
