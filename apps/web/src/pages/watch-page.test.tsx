import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoDetail } from "../types";
import { WatchPage } from "./watch-page";

const api = vi.hoisted(() => ({ getVideo: vi.fn() }));

vi.mock("../services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/api")>()),
  getVideo: api.getVideo,
}));

// The real player needs a media element; the test only cares about the source.
vi.mock("react-player", () => ({
  default: ({ src, title }: { src: string; title: string }) => (
    <div data-testid="player" data-src={src} title={title} />
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
  playbackUrl: "https://storage.test/720p",
  renditions: [
    { name: "720p", height: 720, playbackUrl: "https://storage.test/720p" },
    { name: "360p", height: 360, playbackUrl: "https://storage.test/360p" },
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
    expect((await screen.findByTestId("player")).dataset.src).toBe("https://storage.test/720p");

    // Polling stops once ready, so the signed URL (and the player) stays put.
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(api.getVideo).toHaveBeenCalledTimes(3);
  });

  it("switches quality from the picker", async () => {
    api.getVideo.mockResolvedValue(ready);
    renderPage();

    const picker = await screen.findByRole("combobox", { name: "Quality" });
    expect([...(picker as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      "720p",
      "360p",
    ]);

    fireEvent.change(picker, { target: { value: "360p" } });
    expect(screen.getByTestId("player").dataset.src).toBe("https://storage.test/360p");
  });

  it("explains a failure and still plays the original", async () => {
    api.getVideo.mockResolvedValue({ ...base, status: "FAILED", failureReason: "not a video" });
    renderPage();

    expect(await screen.findByText("Processing failed: not a video")).toBeTruthy();
    expect(screen.getByTestId("player").dataset.src).toBe("https://storage.test/raw");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
