import { withPhotoDeadline } from "./photoDeadline.js";
const pendingDelays = [1000, 3000, 8000, 30_000];
const metadataRefreshTimes = new WeakMap();
function refreshMetadata(events) {
  if (!events) return;
  const now = Date.now();
  if (now - (metadataRefreshTimes.get(events) ?? -Infinity) < 750) return;
  metadataRefreshTimes.set(events, now);
  events.dispatchEvent(new Event("chytnu:photo-metadata-refresh"));
}
// Delivery retries are local to the mounted image, never a global sync error.
export function startPhotoDelivery({ load, onState, events = globalThis.window,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, maxAutomaticRetries = 4, listenForRestore = true }) {
  let stopped = false;
  let running = false;
  let ready = false;
  let rerun = false;
  let attempts = 0;
  let terminal = false;
  let exhausted = false;
  let timer;
  const retry = async (event) => {
    if (stopped || ready) return;
    const changed = event?.type === "chytnu:local-data-restored";
    const explicit = event?.type === "chytnu:photo-delivery-retry";
    // Realtime events are shared across the account: an unrelated catch update
    // must not revive every permanently missing or exhausted thumbnail. A new
    // photo identity starts a fresh controller in the view.
    if (terminal && !explicit) return;
    if (exhausted && changed) return;
    if (running) { if (changed) rerun = true; return; }
    if (explicit) { terminal = false; exhausted = false; attempts = 0; }
    cancel(timer);
    running = true;
    try {
      const blob = await withPhotoDeadline(() => load());
      if (stopped) return;
      if (rerun) {
        if (attempts++ < maxAutomaticRetries) return;
        rerun = false;
        exhausted = true;
        onState({ blob: null, status: "error", errorCode: "photo_delivery_pending" });
        return;
      }
      ready = blob instanceof Blob;
      exhausted = !ready && attempts >= maxAutomaticRetries;
      onState({ blob, status: ready ? "ready" : exhausted ? "error" : "missing", errorCode: exhausted ? "photo_delivery_pending" : "" });
      // Realtime is primary; a pending-only watchdog repairs a lost event.
      if (!ready && attempts < maxAutomaticRetries) {
        const delay = pendingDelays[Math.min(attempts++, pendingDelays.length - 1)];
        timer = schedule(() => { if (!stopped) { refreshMetadata(events); void retry(); } }, delay);
      }
    } catch (error) {
      if (stopped) return;
      const errorCode = error?.photoErrorCode || error?.code || "";
      onState({ blob: null, status: "error", errorCode });
      exhausted = attempts >= maxAutomaticRetries;
      terminal = ["photo_not_owned", "ownership_denied", "firebase_token_invalid", "missing_firebase_user",
        "cloudinary_asset_missing", "invalid_photo_identity", "photo_local_blob_unreadable", "photo_content_mismatch"].includes(errorCode);
      if (!terminal && attempts < maxAutomaticRetries) {
        timer = schedule(retry, Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)));
      }
    } finally {
      running = false;
      if (rerun) { rerun = false; queueMicrotask(() => retry({ type: "chytnu:local-data-restored" })); }
    }
  };
  const names = ["online", "focus", "pageshow", ...(listenForRestore ? ["chytnu:local-data-restored"] : []), "chytnu:photo-delivery-retry"];
  for (const name of names) events?.addEventListener(name, retry);
  void retry();
  return () => {
    stopped = true;
    cancel(timer);
    for (const name of names) events?.removeEventListener(name, retry);
  };
}
