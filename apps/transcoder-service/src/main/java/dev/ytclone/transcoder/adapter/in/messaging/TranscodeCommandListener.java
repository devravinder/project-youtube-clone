package dev.ytclone.transcoder.adapter.in.messaging;

import dev.ytclone.transcoder.application.port.in.TranscodeVideo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class TranscodeCommandListener {

  private final TranscodeCommandMapper mapper;
  private final TranscodeVideo transcodeVideo;

  // A thrown exception rejects the message, which then goes to the dead-letter queue.
  @RabbitListener(queues = TranscodeTopology.QUEUE)
  public void onTranscodeCommand(TranscodeCommandMessage message) {
    log.info("Received transcode command {} for video {}", message.messageId(), message.videoId());
    transcodeVideo.transcode(mapper.toJob(message));
  }
}
