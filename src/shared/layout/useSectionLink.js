import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useSectionLink() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!/^#[a-z][a-z0-9-]*$/i.test(hash)) return;
    const section = document.getElementById(hash.slice(1));
    if (!section || section.matches("input, button, a, select, textarea")) return;
    for (let node = section; node; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) node.open = true;
    }
    const target = section.matches("details") ? section.querySelector("summary") : section;
    if (!target) return;
    if (!target.matches("summary, [tabindex]")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "instant" });
  }, [hash, key]);
}
