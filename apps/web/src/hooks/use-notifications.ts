import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "react-oidc-context";
import { config } from "../config";
import { videoKeys } from "../queries/videos";
import { connectNotifications, notificationsUrl } from "../services/notifications";

export const TOAST_MS = 8000;
const MAX_TOASTS = 3;

export interface Toast {
  readonly id: number;
  readonly videoId: string;
  readonly text: string;
}

/** Live toasts for new videos; the uploader is told their own video is ready. */
export function useNotifications() {
  const auth = useAuth();
  const token = auth.user?.access_token;
  const queryClient = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (auth.isLoading) return;
    // Reconnects when the user signs in or out, so the server knows who this socket belongs to.
    return connectNotifications({
      url: notificationsUrl(config.notificationsPath),
      token,
      onMessage: (message) => {
        if (message.event === "auth") return;
        const { videoId, title } = message.data;
        const text =
          message.event === "video.ready"
            ? `Your video "${title}" is ready`
            : `New video: ${title}`;
        const id = nextId.current++;
        setToasts((current) => [...current, { id, videoId, text }].slice(-MAX_TOASTS));
        setTimeout(() => dismiss(id), TOAST_MS);
        void queryClient.invalidateQueries({ queryKey: videoKeys.list() });
        void queryClient.invalidateQueries({ queryKey: videoKeys.detail(videoId) });
      },
    });
  }, [auth.isLoading, token, queryClient, dismiss]);

  return { toasts, dismiss };
}
