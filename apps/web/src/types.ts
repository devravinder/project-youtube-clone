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
  readonly playbackUrl: string | null;
}

export interface PresignRequest {
  readonly filename: string;
  readonly contentType: string;
  readonly title?: string;
  readonly description?: string;
}

export interface PresignResponse {
  readonly videoId: string;
  readonly bucket: string;
  readonly key: string;
  readonly uploadUrl: string;
  readonly expiresInSeconds: number;
}
