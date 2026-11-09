import { type ServerMessage, serverMessageSchema } from "@yt/contracts";

const MAX_BACKOFF_MS = 30_000;

type SocketLike = Pick<WebSocket, "send" | "close" | "readyState"> & {
  onopen: ((this: WebSocket, ev: Event) => unknown) | null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null;
};

export interface NotificationOptions {
  readonly url: string;
  readonly token?: string;
  readonly onMessage: (message: ServerMessage) => void;
  readonly createSocket?: (url: string) => SocketLike;
}

// Same origin as the page, so the Vite proxy (or an ingress) can route /ws.
export function notificationsUrl(path: string, location: Location = window.location): string {
  return `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`;
}

/** Keeps one socket open, reconnecting with backoff; returns a function that closes it for good. */
export function connectNotifications({
  url,
  token,
  onMessage,
  createSocket = (u) => new WebSocket(u),
}: NotificationOptions): () => void {
  let socket: SocketLike | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const open = () => {
    socket = createSocket(url);
    socket.onopen = () => {
      attempt = 0;
      // The token goes in a message, never in the URL, where proxies would log it.
      if (token) socket?.send(JSON.stringify({ event: "auth", data: { token } }));
    };
    socket.onmessage = (event) => {
      try {
        const parsed = serverMessageSchema.safeParse(JSON.parse(String(event.data)));
        if (parsed.success) onMessage(parsed.data);
      } catch {
        // Not JSON: not ours.
      }
    };
    socket.onclose = () => {
      if (closed) return;
      timer = setTimeout(open, Math.min(1000 * 2 ** attempt++, MAX_BACKOFF_MS));
    };
  };

  open();
  return () => {
    closed = true;
    clearTimeout(timer);
    socket?.close();
  };
}
