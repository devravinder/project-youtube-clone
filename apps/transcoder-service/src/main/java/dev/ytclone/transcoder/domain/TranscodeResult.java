package dev.ytclone.transcoder.domain;

import java.util.List;

public record TranscodeResult(String videoId, List<String> outputKeys) {

  public TranscodeResult {
    outputKeys = List.copyOf(outputKeys);
  }
}
