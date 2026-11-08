package dev.ytclone.transcoder.adapter.out.messaging;

/** upload-service owns the queue (transcode-topology.ts); the transcoder only publishes. */
public final class StatusTopology {

  public static final String EXCHANGE = "yt.video-status";
  public static final String ROUTING_KEY = "video.status";

  private StatusTopology() {}
}
