import { useEffect, useRef } from "react";

const PRELOAD_MARGIN = "300px";

// Re-observes on resetKey so a visible sentinel keeps paging.
export function useInView<T extends Element>(
  onVisible: () => void,
  enabled: boolean,
  resetKey: unknown,
) {
  const ref = useRef<T | null>(null);
  const callback = useRef(onVisible);

  useEffect(() => {
    callback.current = onVisible;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          callback.current();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, resetKey]);

  return ref;
}
