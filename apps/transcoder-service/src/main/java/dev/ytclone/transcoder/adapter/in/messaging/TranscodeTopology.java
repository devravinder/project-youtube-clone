package dev.ytclone.transcoder.adapter.in.messaging;

/** Broker names; upload-service declares the same ones in transcode-topology.ts. */
public final class TranscodeTopology {

  public static final String EXCHANGE = "yt.transcode";
  public static final String ROUTING_KEY = "transcode.cmd";
  public static final String QUEUE = "transcoder.transcode-video";
  public static final String DEAD_LETTER_EXCHANGE = "yt.transcode.dlx";
  public static final String DEAD_LETTER_QUEUE = "transcoder.transcode-video.dlq";
  // Transcoder only: a TTL queue that dead-letters back to EXCHANGE, i.e. a delayed retry.
  public static final String RETRY_QUEUE = "transcoder.transcode-video.retry";
  public static final String ATTEMPT_HEADER = "x-yt-attempt";

  private TranscodeTopology() {}
}
