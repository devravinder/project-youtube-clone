import { useEffect, useRef } from "react";

const PRELOAD_MARGIN = "300px";

// Calls onVisible whenever the element enters view. Re-observing on `resetKey`
// matters: the observer only fires on change, so a sentinel that stays visible after
// a page loads would otherwise never trigger the next load.
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
