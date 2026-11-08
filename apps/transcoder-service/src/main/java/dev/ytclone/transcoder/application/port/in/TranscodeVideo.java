package dev.ytclone.transcoder.application.port.in;

import dev.ytclone.transcoder.domain.TranscodeJob;
import dev.ytclone.transcoder.domain.TranscodeResult;

public interface TranscodeVideo {

    TranscodeResult transcode(TranscodeJob job);
}
