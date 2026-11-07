import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createPresignedUpload, getVideo, listVideos, uploadToStorage } from "../services/api";

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

  const mutation = useMutation({
    mutationFn: async ({ file, title, description }: UploadInput) => {
      setPercent(0);
      const presign = await createPresignedUpload({
        filename: file.name,
        contentType: file.type,
        title,
        description,
      });
      await uploadToStorage(presign.uploadUrl, file, setPercent);
      return { videoId: presign.videoId, title: title ?? file.name };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: videoKeys.all }),
  });

  return { ...mutation, percent };
}
