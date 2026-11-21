import { createContext, useContext, useLayoutEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { internalBackSteps, rememberPage } from "./pageNavigation.js";

export const NavigationMemory = createContext(null);

export function createNavigationMemory(scopeKey) {
  const entries = new Map();
  let current;
  let restoring = false;

  return {
    scopeKey,
    record(location, action) {
      const previous = current;
      current = rememberPage(entries, current, location, action);
      if (action !== "POP") restoring = false;
      return Boolean(previous && previous.pathname !== location.pathname);
    },
    backSteps(key, allowSamePage) {
      const entry = entries.get(key);
      return entry ? internalBackSteps(entries, entry, { allowSamePage }) : 0;
    },
    readView(key, name) { return entries.get(key)?.view?.get(name); },
    saveView(key, name, value) {
      const entry = entries.get(key);
      if (!entry) return;
      entry.view ??= new Map();
      entry.view.set(name, value);
    },
    saveScroll(top) { if (current && !restoring) current.scrollY = top; },
    requestRestore() { restoring = true; },
    needsRestore() { return restoring; },
    restoreScroll(key) {
      if (!restoring || current?.key !== key) return null;
      restoring = false;
      return current.scrollY ?? 0;
    },
  };
}

export function useRouteMemory(name, initial) {
  const memory = useContext(NavigationMemory);
  const { key } = useLocation();
  const [value, setValue] = useState(() => memory?.readView(key, name) ?? (typeof initial === "function" ? initial() : initial));
  useLayoutEffect(() => {
    // Page effects run before the provider records a newly pushed entry.
    let active = true;
    queueMicrotask(() => {
      if (active) memory?.saveView(key, name, value);
    });
    return () => { active = false; };
  }, [key, memory, name, value]);
  return [value, setValue];
}
