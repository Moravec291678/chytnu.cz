// Delivery retries are local to the mounted image, never a global sync error.
export function startPhotoDelivery({ load, onState, events = globalThis.window,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout }) {
  let stopped = false;
  let running = false;
  let ready = false;
  let rerun = false;
  let attempts = 0;
  let timer;
  const retry = async () => {
    if (stopped || ready) return;
    if (running) { rerun = true; return; }
    cancel(timer);
    running = true;
    try {
      const blob = await load();
      if (stopped) return;
      ready = blob instanceof Blob;
      onState({ blob, status: ready ? "ready" : "missing", errorCode: "" });
      // Missing metadata waits for realtime/resume instead of polling.
    } catch (error) {
      if (stopped) return;
      onState({ blob: null, status: "error", errorCode: error?.code ?? "" });
      if (!["photo_not_owned", "ownership_denied", "firebase_token_invalid", "missing_firebase_user",
        "cloudinary_asset_missing", "invalid_photo_identity", "photo_local_blob_unreadable"].includes(error?.code)) {
        timer = schedule(retry, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
      }
    } finally {
      running = false;
      if (rerun) { rerun = false; queueMicrotask(retry); }
    }
  };
  const names = ["online", "focus", "pageshow", "chytnu:local-data-restored"];
  for (const name of names) events?.addEventListener(name, retry);
  void retry();
  return () => {
    stopped = true;
    cancel(timer);
    for (const name of names) events?.removeEventListener(name, retry);
  };
}
