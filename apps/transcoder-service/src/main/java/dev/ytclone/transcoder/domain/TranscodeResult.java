package dev.ytclone.transcoder.domain;

import java.util.List;

/** Keys in the output bucket: the master playlist and one variant playlist per rendition. */
public record TranscodeResult(String videoId, String masterPlaylistKey, List<String> outputKeys) {

  public TranscodeResult {
    outputKeys = List.copyOf(outputKeys);
  }
}
