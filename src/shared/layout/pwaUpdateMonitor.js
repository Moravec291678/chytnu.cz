const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Keep an installed app's service-worker update check alive after its first load. */
export function monitorPwaUpdates({ serviceWorker, windowObject = globalThis.window,
  documentObject = globalThis.document, onAvailable, setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval, intervalMs = UPDATE_CHECK_INTERVAL_MS }) {
  if (!serviceWorker || typeof onAvailable !== "function") return { dispose() {}, ready: Promise.resolve() };
  let disposed = false;
  let registration = null;
  let observingRegistration = false;
  let updateWorker = null;
  let announced = false;
  let hadController = Boolean(serviceWorker.controller);
  const notify = () => {
    if (disposed || !hadController || announced) return;
    announced = true;
    onAvailable();
  };
  const onControllerChange = () => {
    if (hadController) notify();
    hadController = true;
  };
  const onWorkerStateChange = () => {
    if (updateWorker?.state === "installed" && serviceWorker.controller) notify();
  };
  const onUpdateFound = () => {
    updateWorker?.removeEventListener?.("statechange", onWorkerStateChange);
    updateWorker = registration?.installing ?? null;
    announced = false;
    updateWorker?.addEventListener?.("statechange", onWorkerStateChange);
    onWorkerStateChange();
  };
  const check = async () => {
    if (disposed || documentObject?.visibilityState === "hidden") return;
    try {
      registration ??= await serviceWorker.getRegistration?.();
      if (disposed || !registration) return;
      if (!observingRegistration) {
        registration.addEventListener?.("updatefound", onUpdateFound);
        observingRegistration = true;
      }
      if (registration.waiting && serviceWorker.controller) notify();
      await registration.update?.();
    } catch { /* Offline and unsupported update checks leave the running app intact. */ }
  };
  serviceWorker.addEventListener?.("controllerchange", onControllerChange);
  windowObject?.addEventListener?.("focus", check);
  documentObject?.addEventListener?.("visibilitychange", check);
  const timer = typeof setIntervalFn === "function" ? setIntervalFn(() => void check(), intervalMs) : null;
  const ready = check();
  return {
    ready,
    check,
    dispose() {
      disposed = true;
      serviceWorker.removeEventListener?.("controllerchange", onControllerChange);
      windowObject?.removeEventListener?.("focus", check);
      documentObject?.removeEventListener?.("visibilitychange", check);
      registration?.removeEventListener?.("updatefound", onUpdateFound);
      updateWorker?.removeEventListener?.("statechange", onWorkerStateChange);
      if (timer !== null && typeof clearIntervalFn === "function") clearIntervalFn(timer);
    },
  };
}
