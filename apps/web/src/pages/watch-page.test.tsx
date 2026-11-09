import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoDetail } from "../types";
import { WatchPage } from "./watch-page";

const api = vi.hoisted(() => ({ getVideo: vi.fn(), recordView: vi.fn() }));

vi.mock("../services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/api")>()),
  getVideo: api.getVideo,
  recordView: api.recordView,
}));

// The player has its own tests; here only the source it gets, and its first-play callback, matter.
vi.mock("../components/hls-video", () => ({
  HlsVideo: ({
    src,
    title,
    onFirstPlay,
  }: {
    src: string;
    title: string;
    onFirstPlay?: () => void;
  }) => (
    <div data-testid="player" data-src={src} title={title}>
      {onFirstPlay && (
        <button type="button" onClick={onFirstPlay}>
          play
        </button>
      )}
    </div>
  ),
}));
const base: VideoDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Clip",
  description: null,
  status: "UPLOADED",
  viewCount: 0,
  createdAt: "2026-11-08T10:00:00.000Z",
  contentType: "video/mp4",
  playbackUrl: "https://storage.test/raw",
  renditions: [],
  failureReason: null,
};

const ready: VideoDetail = {
  ...base,
  status: "READY",
  playbackUrl: "https://cdn.test/v/hls/master.m3u8",
  renditions: [
    { name: "720p", height: 720, playbackUrl: "https://cdn.test/v/hls/720p/index.m3u8" },
    { name: "360p", height: 360, playbackUrl: "https://cdn.test/v/hls/360p/index.m3u8" },
  ],
};

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[`/watch/${base.id}`]}>
        <Routes>
          <Route path="/watch/:id" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.getVideo.mockReset();
  api.recordView.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("WatchPage", () => {
  it("shows progress instead of a player while transcoding, then plays once ready", async () => {
    api.getVideo
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce({ ...base, status: "PROCESSING" })
      .mockResolvedValue(ready);

    renderPage();
    expect(await screen.findByText("Waiting for the transcoder...")).toBeTruthy();
    expect(screen.queryByTestId("player")).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(await screen.findByText("Transcoding...")).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect((await screen.findByTestId("player")).dataset.src).toBe(
      "https://cdn.test/v/hls/master.m3u8",
    );

    // Polling stops once ready, so the signed URL (and the player) stays put.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(api.getVideo).toHaveBeenCalledTimes(3);
  });

  it("explains a failure and still plays the original", async () => {
    api.getVideo.mockResolvedValue({ ...base, status: "FAILED", failureReason: "not a video" });
    renderPage();

    expect(await screen.findByText("Processing failed: not a video")).toBeTruthy();
    expect(screen.getByTestId("player").dataset.src).toBe("https://storage.test/raw");
    // Only READY videos count views.
    expect(screen.queryByRole("button", { name: "play" })).toBeNull();
  });

  it("records one view on first play and shows it at once", async () => {
    api.getVideo.mockResolvedValue({ ...ready, viewCount: 41 });
    api.recordView.mockResolvedValue({ counted: true });
    renderPage();
    expect(await screen.findByText("41 views")).toBeTruthy();

    await act(async () => screen.getByRole("button", { name: "play" }).click());

    expect(api.recordView).toHaveBeenCalledWith(base.id);
    expect(await screen.findByText("42 views")).toBeTruthy();
    expect(api.getVideo).toHaveBeenCalledTimes(1);
  });

  it("leaves the count alone for a repeat view", async () => {
    api.getVideo.mockResolvedValue({ ...ready, viewCount: 41 });
    api.recordView.mockResolvedValue({ counted: false });
    renderPage();
    await screen.findByText("41 views");

    await act(async () => screen.getByRole("button", { name: "play" }).click());

    expect(api.recordView).toHaveBeenCalledTimes(1);
    expect(screen.getByText("41 views")).toBeTruthy();
  });
});
