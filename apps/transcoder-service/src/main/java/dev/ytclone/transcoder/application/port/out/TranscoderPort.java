package dev.ytclone.transcoder.application.port.out;

import dev.ytclone.transcoder.domain.Rendition;
import java.nio.file.Path;

public interface TranscoderPort {

    int probeHeight(Path source);

    void transcode(Path source, Rendition rendition, Path target);
}
