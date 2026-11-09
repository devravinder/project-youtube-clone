import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ServerMessage } from "@yt/contracts";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_MS, useNotifications } from "./use-notifications";

const auth = vi.hoisted(() => ({
  isLoading: false,
  user: null as { access_token: string } | null,
}));
const connections = vi.hoisted(
  () => [] as { token?: string; onMessage: (m: ServerMessage) => void; closed: boolean }[],
);

vi.mock("react-oidc-context", () => ({ useAuth: () => auth }));
vi.mock("../services/notifications", () => ({
  notificationsUrl: (path: string) => `ws://test${path}`,
  connectNotifications: (options: { token?: string; onMessage: (m: ServerMessage) => void }) => {
    const connection = { ...options, closed: false };
    connections.push(connection);
    return () => {
      connection.closed = true;
    };
  },
}));

const videoId = "6f1e2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.useFakeTimers();
  connections.length = 0;
  auth.isLoading = false;
  auth.user = null;
  queryClient = new QueryClient();
});
afterEach(() => vi.useRealTimers());

describe("useNotifications", () => {
  it("shows a toast per notification and refreshes the video queries", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useNotifications(), { wrapper });

    act(() => {
      connections[0]?.onMessage({ event: "video.published", data: { videoId, title: "Cats" } });
      connections[0]?.onMessage({ event: "video.ready", data: { videoId, title: "Mine" } });
      connections[0]?.onMessage({ event: "auth", data: { ok: true, userId: "u" } });
    });

    expect(result.current.toasts.map((t) => t.text)).toEqual([
      "New video: Cats",
      'Your video "Mine" is ready',
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["videos", "list"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["videos", "detail", videoId] });
  });

  it("dismisses toasts by hand and after a timeout, keeping at most three", () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    act(() => {
      for (const title of ["a", "b", "c", "d"]) {
        connections[0]?.onMessage({ event: "video.published", data: { videoId, title } });
      }
    });
    expect(result.current.toasts.map((t) => t.text)).toEqual([
      "New video: b",
      "New video: c",
      "New video: d",
    ]);

    act(() => result.current.dismiss(result.current.toasts[0]!.id));
    expect(result.current.toasts).toHaveLength(2);

    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(result.current.toasts).toHaveLength(0);
  });

  it("waits for auth to load, then reconnects with the token after sign-in", () => {
    auth.isLoading = true;
    const { rerender } = renderHook(() => useNotifications(), { wrapper });
    expect(connections).toHaveLength(0);

    auth.isLoading = false;
    rerender();
    expect(connections[0]?.token).toBeUndefined();

    auth.user = { access_token: "t1" };
    rerender();
    expect(connections[0]?.closed).toBe(true);
    expect(connections[1]?.token).toBe("t1");
  });
});
