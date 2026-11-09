import Hls, { ErrorTypes, Events, type ErrorData, type Level } from "hls.js";
import { useEffect, useRef, useState } from "react";

const AUTO = -1;
const MAX_NETWORK_RETRIES = 3;

interface Quality {
  readonly index: number;
  readonly height: number;
}

interface HlsVideoProps {
  readonly src: string;
  readonly title: string;
  /** Called once per source, when frames first play. */
  readonly onFirstPlay?: () => void;
}

const isPlaylist = (src: string) => new URL(src, window.location.href).pathname.endsWith(".m3u8");

/**
 * Plays HLS through hls.js (adaptive bitrate, pinnable quality), native HLS on Safari, and any
 * other source (e.g. the original MP4) through the plain video element.
 */
export function HlsVideo({ src, title, onFirstPlay }: HlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playedRef = useRef(false);
  const onFirstPlayRef = useRef(onFirstPlay);
  onFirstPlayRef.current = onFirstPlay;
  const [qualities, setQualities] = useState<Quality[]>([]);
  const [choice, setChoice] = useState(AUTO);
  const [playing, setPlaying] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setQualities([]);
    setChoice(AUTO);
    setPlaying(null);
    setError(null);
    playedRef.current = false;

    if (!isPlaylist(src) || !Hls.isSupported()) {
      // Safari plays HLS natively; it adapts on its own but exposes no levels.
      if (isPlaylist(src) && !video.canPlayType("application/vnd.apple.mpegurl")) {
        setError("This browser cannot play HLS video.");
        return;
      }
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    // capLevelToPlayerSize: no 1080p into a 400 px wide player.
    // maxMaxBufferLength: default lets 720p prefetch ~160 s; 30 s saves egress, adapts sooner.
    const hls = new Hls({ capLevelToPlayerSize: true, maxMaxBufferLength: 30 });
    hlsRef.current = hls;
    let networkRetries = 0;
    let recoveredMedia = false;

    hls.on(Events.MANIFEST_PARSED, (_event, data: { levels: Level[] }) => {
      setQualities(
        data.levels
          .map((level, index) => ({ index, height: level.height }))
          .sort((a, b) => b.height - a.height),
      );
    });
    hls.on(Events.LEVEL_SWITCHED, (_event, data: { level: number }) => setPlaying(data.level));
    hls.on(Events.ERROR, (_event, data: ErrorData) => {
      if (!data.fatal) {
        return;
      }
      if (data.type === ErrorTypes.NETWORK_ERROR && networkRetries < MAX_NETWORK_RETRIES) {
        networkRetries += 1;
        hls.startLoad();
      } else if (data.type === ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
        recoveredMedia = true;
        hls.recoverMediaError();
      } else {
        hls.destroy();
        hlsRef.current = null;
        setError(`Playback failed (${data.details}).`);
      }
    });
    hls.loadSource(src);
    hls.attachMedia(video);

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  const choose = (index: number) => {
    setChoice(index);
    // nextLevel switches at the next segment, so playback does not stall; -1 hands control back to ABR.
    if (hlsRef.current) {
      hlsRef.current.nextLevel = index;
    }
  };

  const heightOf = (index: number | null) => qualities.find((q) => q.index === index)?.height;
  const playingHeight = heightOf(playing);

  return (
    <div>
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          controls
          playsInline
          aria-label={title}
          className="size-full"
          data-testid="video"
          onPlaying={() => {
            if (playedRef.current) return;
            playedRef.current = true;
            onFirstPlayRef.current?.();
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {qualities.length > 1 && (
        <label className="mt-2 flex items-center justify-end gap-2 text-sm">
          Quality
          <select
            className="rounded-md border border-border bg-background px-2 py-1"
            value={choice}
            onChange={(event) => choose(Number(event.target.value))}
          >
            <option value={AUTO}>
              {choice === AUTO && playingHeight ? `Auto (${playingHeight}p)` : "Auto"}
            </option>
            {qualities.map((q) => (
              <option key={q.index} value={q.index}>
                {q.height}p
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
