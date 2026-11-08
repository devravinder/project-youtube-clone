package dev.ytclone.transcoder.application.port.out;

import dev.ytclone.transcoder.domain.TranscodeResult;

/** Tells the rest of the system how a video is doing; must not return before it is delivered. */
public interface VideoStatusPort {

  void processing(String videoId);

  void ready(TranscodeResult result);

  void failed(String videoId, String reason);
}
