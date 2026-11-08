// Wire format: contracts/transcode-command.schema.json.
export interface TranscodeCommand {
  messageId: string;
  videoId: string;
  sourceBucket: string;
  sourceKey: string;
  contentType: string;
  requestedAt: string;
}

export interface TranscodeQueuePort {
  // Resolves only after the broker confirms it stored the command.
  requestTranscode(command: TranscodeCommand): Promise<void>;
}
