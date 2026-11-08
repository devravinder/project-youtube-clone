import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getAccessToken, userManager } from "../auth/user-manager";
import { ApiError, getVideo, listVideos } from "../services/api";
import { cancelUpload, uploadVideo } from "../services/upload";
import type { VideoStatus } from "../types";

const PAGE_SIZE = 12;
const PLAYBACK_URL_STALE_MS = 30 * 60 * 1000;
export const STATUS_POLL_MS = 2000;

// Transcoding has not finished yet, so the detail is worth asking for again.
export function isProcessing(status: VideoStatus | undefined): boolean {
  return status === "UPLOADED" || status === "PROCESSING";
}

export const videoKeys = {
  all: ["videos"] as const,
  list: () => [...videoKeys.all, "list"] as const,
  detail: (id: string) => [...videoKeys.all, "detail", id] as const,
};

export function useInfiniteVideos() {
  return useInfiniteQuery({
    queryKey: videoKeys.list(),
    queryFn: ({ pageParam }) => listVideos({ cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useVideo(id: string) {
  return useQuery({
    queryKey: videoKeys.detail(id),
    queryFn: () => getVideo(id),
    // Each fetch signs a new URL, so refetching would restart the player.
    staleTime: PLAYBACK_URL_STALE_MS,
    refetchOnWindowFocus: false,
    // Poll only until transcoding ends; nothing plays meanwhile, so new URLs do no harm.
    refetchInterval: (query) => (isProcessing(query.state.data?.status) ? STATUS_POLL_MS : false),
  });
}

interface UploadInput {
  readonly file: File;
  readonly title?: string;
  readonly description?: string;
}

export function useUploadVideo() {
  const queryClient = useQueryClient();
  const [percent, setPercent] = useState(0);
  const running = useRef<{ file: File; controller: AbortController } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ file, title, description }: UploadInput) => {
      setPercent(0);
      if (!(await getAccessToken())) {
        throw new ApiError(401, "Please sign in to upload");
      }
      const controller = new AbortController();
      running.current = { file, controller };
      try {
        return await uploadVideo({
          file,
          title,
          description,
          signal: controller.signal,
          onProgress: setPercent,
        });
      } finally {
        running.current = null;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: videoKeys.all }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void userManager.signinRedirect({ state: { returnTo: "/upload" } });
      }
    },
  });

  // Stop the transfer and discard stored parts.
  const cancel = async () => {
    const current = running.current;
    if (!current) {
      return;
    }
    current.controller.abort();
    await cancelUpload(current.file);
    mutation.reset();
    setPercent(0);
  };

  return { ...mutation, percent, cancel };
}
