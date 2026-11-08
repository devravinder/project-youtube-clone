package dev.ytclone.transcoder.application.port.out;

import dev.ytclone.transcoder.domain.Rendition;
import dev.ytclone.transcoder.domain.VideoInfo;
import java.nio.file.Path;

public interface TranscoderPort {

  VideoInfo probe(Path source);

  /** Writes index.m3u8 and its segments into outputDir; keyframes align across renditions. */
  void transcodeToHls(Path source, Rendition rendition, Path outputDir);
}
