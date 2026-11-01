import { startPhotoDelivery } from "./photoDeliveryRetry.js";

export function createDetailPhotoDelivery(load, publish) {
  const slots = new Map();
  let order = [];
  function emit() {
    const rows = order.map(id => slots.get(id)).filter(Boolean);
    publish(rows.filter(row => row.url).map(row => ({ ...row.photo, blob: row.blob, url: row.url })),
      rows.filter(row => row.error).map(row => row.error));
  }
  function remove(id) {
    const slot = slots.get(id);
    slots.delete(id);
    slot.stop?.();
    if (slot.url) URL.revokeObjectURL(slot.url);
  }
  return {
    update(photos, scope, retryFailed = false) {
      order = photos.map(photo => photo.id);
      for (const id of slots.keys()) if (!order.includes(id)) remove(id);
      for (const photo of photos) {
        const key = JSON.stringify([scope.scopeKey, scope.ownerId, scope.catchId, photo.cloud?.state,
          photo.cloud?.provider, photo.cloud?.objectKey, photo.cloud?.sha256, photo.size, photo.type,
          photo.localError?.code, photo.blob instanceof Blob]);
        const previous = slots.get(photo.id);
        if (previous?.key === key && !(retryFailed && previous.error)) { previous.photo = photo; continue; }
        if (previous) remove(photo.id);
        const slot = { key, photo };
        slots.set(photo.id, slot);
        if (photo.cloud?.state === "unavailable" && !(photo.blob instanceof Blob)) continue;
        slot.stop = startPhotoDelivery({
          listenForRestore: false,
          load: () => load({ ...scope, photo: slot.photo }),
          onState({ blob, status, errorCode }) {
            if (slots.get(photo.id) !== slot) return;
            if (blob) { slot.url = URL.createObjectURL(blob); slot.blob = blob; }
            slot.error = status === "error" ? errorCode || "photo_delivery_failed" : "";
            emit();
          },
        });
      }
      emit();
    },
    close() { for (const id of slots.keys()) remove(id); },
  };
}
