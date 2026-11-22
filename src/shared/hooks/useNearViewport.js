import { useEffect, useRef, useState } from "react";

export function useNearViewport({ immediate = false, enabled = true, rootMargin = "180px" } = {}) {
  const ref = useRef(null);
  const [entered, setEntered] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (!enabled || immediate || entered || !ref.current) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setEntered(true);
      observer.disconnect();
    }, { rootMargin });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [enabled, entered, immediate, rootMargin]);
  return [ref, immediate || entered];
}
