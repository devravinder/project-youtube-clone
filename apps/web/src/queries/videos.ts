import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getAccessToken, userManager } from "../auth/user-manager";
import { ApiError, getVideo, listVideos } from "../services/api";
import { cancelUpload, uploadVideo } from "../services/upload";

const PAGE_SIZE = 12;
const PLAYBACK_URL_STALE_MS = 30 * 60 * 1000;

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
    // Every fetch signs a new playback URL; a refetch would restart the player.
    // Keep the data fresh for most of the URL's one-hour life, and skip focus refetches.
    staleTime: PLAYBACK_URL_STALE_MS,
    refetchOnWindowFocus: false,
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

  // Stops the transfer and discards what was already stored.
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
