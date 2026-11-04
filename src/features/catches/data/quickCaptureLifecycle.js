export const QUICK_CAPTURE_INVALIDATED = "chytnu:quick-capture-invalidated";
export const quickCaptureGenerationKey = scopeKey => JSON.stringify(["quickCaptureGeneration", scopeKey]);
export function invalidateQuickCapture(scopeKey) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_INVALIDATED, { detail: { scopeKey } }));
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(QUICK_CAPTURE_INVALIDATED);
      channel.postMessage({ scopeKey });
      channel.close();
    } catch { /* The database generation guard still protects tabs without messaging. */ }
  }
}
export function subscribeQuickCaptureInvalidation(callback) {
  const local = event => callback(event.detail?.scopeKey);
  window.addEventListener(QUICK_CAPTURE_INVALIDATED, local);
  let channel = null;
  try { if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(QUICK_CAPTURE_INVALIDATED); }
  catch { /* Local invalidation and the persisted generation remain available. */ }
  if (channel) channel.onmessage = event => callback(event.data?.scopeKey);
  return () => { window.removeEventListener(QUICK_CAPTURE_INVALIDATED, local); channel?.close(); };
}
