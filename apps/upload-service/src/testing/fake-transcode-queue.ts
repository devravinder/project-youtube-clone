import type { TranscodeCommand, TranscodeQueuePort } from "@yt/ports";

export class FakeTranscodeQueue implements TranscodeQueuePort {
  readonly commands: TranscodeCommand[] = [];
  failWith: Error | null = null;

  async requestTranscode(command: TranscodeCommand): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.commands.push(command);
  }

  reset(): void {
    this.commands.length = 0;
    this.failWith = null;
  }
}
