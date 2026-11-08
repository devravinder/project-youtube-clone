package dev.ytclone.transcoder.domain;

public record Rendition(String name, int height, int videoBitrateKbps) {

    public Rendition {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name must not be blank");
        }
        if (height < 2 || height % 2 != 0) {
            throw new IllegalArgumentException("height must be an even number of at least 2");
        }
        if (videoBitrateKbps <= 0) {
            throw new IllegalArgumentException("videoBitrateKbps must be positive");
        }
    }
}
