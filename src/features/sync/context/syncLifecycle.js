const RESUME_EVENTS = ["focus", "pageshow"];

/** Re-pull on app resume and periodically while the signed-in app is visible. */
export function attachSyncLifecycle({ windowObject = window, documentObject = document, runSync, intervalMs = 45_000 }) {
  let disposed = false;
  let lastRunAt = 0;
  const trigger = () => {
    if (disposed || documentObject.visibilityState === "hidden" || windowObject.navigator?.onLine === false) return;
    const now = Date.now();
    if (now - lastRunAt < 1_000) return;
    lastRunAt = now;
    void runSync();
  };
  const onVisibility = () => { if (documentObject.visibilityState === "visible") trigger(); };
  RESUME_EVENTS.forEach((eventName) => windowObject.addEventListener(eventName, trigger));
  windowObject.addEventListener("online", trigger);
  documentObject.addEventListener("visibilitychange", onVisibility);
  const timer = intervalMs > 0 ? windowObject.setInterval(trigger, intervalMs) : null;
  return () => {
    disposed = true;
    RESUME_EVENTS.forEach((eventName) => windowObject.removeEventListener(eventName, trigger));
    windowObject.removeEventListener("online", trigger);
    documentObject.removeEventListener("visibilitychange", onVisibility);
    if (timer !== null) windowObject.clearInterval(timer);
  };
}
