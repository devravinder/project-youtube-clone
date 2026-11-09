import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectNotifications, notificationsUrl } from "./notifications";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) });
  }
  drop() {
    this.onclose?.();
  }
}

const create = (url: string) => new FakeSocket(url) as never;
const videoId = "6f1e2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("notificationsUrl", () => {
  it("uses ws on http and wss on https, same host", () => {
    expect(notificationsUrl("/ws", { protocol: "http:", host: "localhost:5173" } as Location)).toBe(
      "ws://localhost:5173/ws",
    );
    expect(notificationsUrl("/ws", { protocol: "https:", host: "yt.example" } as Location)).toBe(
      "wss://yt.example/ws",
    );
  });
});

describe("connectNotifications", () => {
  it("sends the token in an auth message after the socket opens", () => {
    connectNotifications({
      url: "ws://x/ws",
      token: "t1",
      onMessage: () => {},
      createSocket: create,
    });
    const [socket] = FakeSocket.all;

    expect(socket?.url).toBe("ws://x/ws");
    expect(socket?.sent).toEqual([]);
    socket?.open();
    expect(socket?.sent).toEqual([JSON.stringify({ event: "auth", data: { token: "t1" } })]);
  });

  it("stays anonymous without a token", () => {
    connectNotifications({ url: "ws://x/ws", onMessage: () => {}, createSocket: create });
    FakeSocket.all[0]?.open();

    expect(FakeSocket.all[0]?.sent).toEqual([]);
  });

  it("passes on valid messages and drops anything else", () => {
    const seen: unknown[] = [];
    connectNotifications({ url: "u", onMessage: (m) => seen.push(m), createSocket: create });
    const socket = FakeSocket.all[0];
    const valid = { event: "video.published", data: { videoId, title: "Cats" } };

    socket?.receive(valid);
    socket?.receive("not json");
    socket?.receive({ event: "video.published", data: { videoId: "nope", title: "x" } });
    socket?.receive({ event: "something-else", data: {} });

    expect(seen).toEqual([valid]);
  });

  it("reconnects with backoff after a drop, resetting once connected", () => {
    connectNotifications({ url: "u", onMessage: () => {}, createSocket: create });
    FakeSocket.all[0]?.drop();
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);

    FakeSocket.all[1]?.drop();
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.all).toHaveLength(3);

    FakeSocket.all[2]?.open();
    FakeSocket.all[2]?.drop();
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(4);
  });

  it("stops for good when closed", () => {
    const close = connectNotifications({ url: "u", onMessage: () => {}, createSocket: create });

    close();
    vi.advanceTimersByTime(60_000);

    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0]?.closed).toBe(true);
  });
});
