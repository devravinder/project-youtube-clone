export interface VideoSummary {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: string;
  readonly viewCount: number;
  readonly createdAt: string;
}

export interface VideoDetail extends VideoSummary {
  readonly contentType: string;
  // Null until the file has actually been uploaded.
  readonly playbackUrl: string | null;
}
