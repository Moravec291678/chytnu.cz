import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Keeps keyboard focus inside an open modal and returns it to its opener. */
export function useModalFocusTrap(rootRef, { active = true, initialFocusRef, onEscape } = {}) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!active || !root) return undefined;

    const previousFocus = document.activeElement;
    const focusInitial = () => {
      const focusable = initialFocusRef?.current
        ?? root.querySelector(FOCUSABLE_SELECTOR)
        ?? root;
      focusable.focus?.();
    };
    focusInitial();

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = [...root.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        root.focus?.();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (!root.contains(current)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (current === first || current === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, [active, initialFocusRef, rootRef]);
}
