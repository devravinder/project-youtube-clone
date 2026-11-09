import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HlsVideo } from "./hls-video";

type Handler = (event: string, data: unknown) => void;

const hls = vi.hoisted(() => {
  class FakeHls {
    static supported = true;
    static instances: FakeHls[] = [];
    static isSupported = () => FakeHls.supported;
    readonly handlers = new Map<string, Handler>();
    readonly calls: string[] = [];
    nextLevel = -1;
    constructor(readonly config: unknown) {
      FakeHls.instances.push(this);
    }
    on(event: string, handler: Handler) {
      this.handlers.set(event, handler);
    }
    emit(event: string, data: unknown) {
      this.handlers.get(event)?.(event, data);
    }
    loadSource(src: string) {
      this.calls.push(`load ${src}`);
    }
    attachMedia() {
      this.calls.push("attach");
    }
    startLoad() {
      this.calls.push("startLoad");
    }
    recoverMediaError() {
      this.calls.push("recoverMediaError");
    }
    destroy() {
      this.calls.push("destroy");
    }
  }
  return { FakeHls };
});

vi.mock("hls.js", () => ({
  default: hls.FakeHls,
  Events: { MANIFEST_PARSED: "manifest", LEVEL_SWITCHED: "switched", ERROR: "error" },
  ErrorTypes: { NETWORK_ERROR: "network", MEDIA_ERROR: "media", OTHER_ERROR: "other" },
}));

const MASTER = "https://cdn.test/v/hls/master.m3u8";
const instance = () => hls.FakeHls.instances.at(-1)!;
const levels = [{ height: 360 }, { height: 1080 }, { height: 720 }];

beforeEach(() => {
  hls.FakeHls.instances = [];
  hls.FakeHls.supported = true;
});

describe("HlsVideo", () => {
  it("loads the master playlist into hls.js with the size cap", () => {
    render(<HlsVideo src={MASTER} title="Clip" />);

    expect(instance().calls).toEqual([`load ${MASTER}`, "attach"]);
    expect(instance().config).toEqual({ capLevelToPlayerSize: true, maxMaxBufferLength: 30 });
    expect(screen.getByLabelText("Clip").tagName).toBe("VIDEO");
  });

  it("offers Auto plus each level, highest first, and shows which level Auto picked", () => {
    render(<HlsVideo src={MASTER} title="Clip" />);
    act(() => instance().emit("manifest", { levels }));

    const picker = screen.getByRole("combobox", { name: /Quality/ }) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.text)).toEqual(["Auto", "1080p", "720p", "360p"]);

    act(() => instance().emit("switched", { level: 2 }));
    expect(picker.options[0]?.text).toBe("Auto (720p)");
  });

  it("pins a level at the next segment and can hand control back to ABR", () => {
    render(<HlsVideo src={MASTER} title="Clip" />);
    act(() => instance().emit("manifest", { levels }));
    const picker = screen.getByRole("combobox", { name: /Quality/ });

    fireEvent.change(picker, { target: { value: "0" } });
    expect(instance().nextLevel).toBe(0);

    fireEvent.change(picker, { target: { value: "-1" } });
    expect(instance().nextLevel).toBe(-1);
  });

  it("hides the picker when there is only one level", () => {
    render(<HlsVideo src={MASTER} title="Clip" />);
    act(() => instance().emit("manifest", { levels: [{ height: 360 }] }));

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("retries a network error, recovers a media error once, then gives up", () => {
    render(<HlsVideo src={MASTER} title="Clip" />);
    const fail = (type: string) =>
      act(() => instance().emit("error", { fatal: true, type, details: `${type}Failed` }));

    act(() => instance().emit("error", { fatal: false, type: "network", details: "x" }));
    fail("network");
    fail("media");
    expect(instance().calls).toContain("startLoad");
    expect(instance().calls).toContain("recoverMediaError");
    expect(screen.queryByRole("alert")).toBeNull();

    fail("media");
    expect(instance().calls.at(-1)).toBe("destroy");
    expect(screen.getByRole("alert").textContent).toBe("Playback failed (mediaFailed).");
  });

  it("destroys hls.js on unmount", () => {
    const { unmount } = render(<HlsVideo src={MASTER} title="Clip" />);

    unmount();

    expect(instance().calls.at(-1)).toBe("destroy");
  });

  it("plays a non-HLS source through the video element", () => {
    render(<HlsVideo src="https://storage.test/raw/source.mp4?sig=1" title="Clip" />);

    expect(hls.FakeHls.instances).toHaveLength(0);
    expect((screen.getByLabelText("Clip") as HTMLVideoElement).src).toBe(
      "https://storage.test/raw/source.mp4?sig=1",
    );
  });

  it("uses native HLS where hls.js is not supported, and says so where neither works", () => {
    hls.FakeHls.supported = false;
    const canPlay = vi.spyOn(HTMLMediaElement.prototype, "canPlayType");

    canPlay.mockReturnValue("maybe");
    const { unmount } = render(<HlsVideo src={MASTER} title="Native" />);
    expect((screen.getByLabelText("Native") as HTMLVideoElement).src).toBe(MASTER);
    unmount();

    canPlay.mockReturnValue("");
    render(<HlsVideo src={MASTER} title="None" />);
    expect(screen.getByRole("alert").textContent).toBe("This browser cannot play HLS video.");
    canPlay.mockRestore();
  });
});
