import { withPhotoDeadline } from "./photoDeadline.js";
// Delivery retries are local to the mounted image, never a global sync error.
export function startPhotoDelivery({ load, onState, events = globalThis.window,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, maxAutomaticRetries = 4 }) {
  let stopped = false;
  let running = false;
  let ready = false;
  let rerun = false;
  let attempts = 0;
  let terminal = false;
  let timer;
  const retry = async (event) => {
    if (stopped || ready) return;
    const changed = event?.type === "chytnu:local-data-restored";
    const explicit = event?.type === "chytnu:photo-delivery-retry";
    if (terminal && !changed && !explicit) return;
    if (running) { if (changed) rerun = true; return; }
    if (changed || explicit) { terminal = false; attempts = 0; }
    cancel(timer);
    running = true;
    try {
      const blob = await withPhotoDeadline(() => load());
      if (stopped || rerun) return;
      ready = blob instanceof Blob;
      const exhausted = !ready && attempts >= maxAutomaticRetries;
      onState({ blob, status: ready ? "ready" : exhausted ? "error" : "missing", errorCode: exhausted ? "photo_delivery_pending" : "" });
      // Realtime is primary; a pending-only watchdog repairs a lost event.
      if (!ready && attempts++ < maxAutomaticRetries) timer = schedule(() => {
        events?.dispatchEvent(new Event("chytnu:photo-metadata-refresh"));
        void retry();
      }, 30_000);
    } catch (error) {
      if (stopped) return;
      onState({ blob: null, status: "error", errorCode: error?.code ?? "" });
      terminal = ["photo_not_owned", "ownership_denied", "firebase_token_invalid", "missing_firebase_user",
        "cloudinary_asset_missing", "invalid_photo_identity", "photo_local_blob_unreadable"].includes(error?.code);
      if (!terminal && attempts < maxAutomaticRetries) {
        timer = schedule(retry, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
      }
    } finally {
      running = false;
      if (rerun) { rerun = false; queueMicrotask(() => retry({ type: "chytnu:local-data-restored" })); }
    }
  };
  const names = ["online", "focus", "pageshow", "chytnu:local-data-restored", "chytnu:photo-delivery-retry"];
  for (const name of names) events?.addEventListener(name, retry);
  void retry();
  return () => {
    stopped = true;
    cancel(timer);
    for (const name of names) events?.removeEventListener(name, retry);
  };
}
