import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { getGalleryMissingMessage, getGalleryPhotoLoadRequest } from "../features/catches/data/catchGallery.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import { getPhotoAvailability, PHOTO_AVAILABILITY } from "../features/catches/data/photoAvailability.js";
import PhotoSyncStatus from "../features/catches/components/PhotoSyncStatus.js";
import { Link } from "react-router-dom";

export default function GalleryPhotoImage({ item, scope = null, style, alt, loading, enabled = true }) {
  const [loaded, setLoaded] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const objectUrlRef = useRef(null);
  const scopeKey = scope?.scopeKey ?? null;
  const initialRequest = getGalleryPhotoLoadRequest(item, scope);
  const isCurrent = loaded?.item === item && loaded.scopeKey === scopeKey;
  const state = isCurrent
    ? loaded
    : { blob: initialRequest.kind === "local" ? initialRequest.blob : null,
      status: !enabled ? "idle" : initialRequest.kind === "remote" ? "loading" : "missing" };
  const availability = getPhotoAvailability(item, { loadState: state.status === "decode-error" ? "error" : state.status, errorCode: state.errorCode });
  useEffect(() => {
    let active = true;
    if (!enabled) return undefined;
    Promise.resolve().then(async () => {
      try {
        const request = getGalleryPhotoLoadRequest(item, scope);
        const blob = request.kind === "local" ? request.blob
          : request.kind === "remote" ? await getPhotoBlobForDisplay(request.options) : null;
        if (active) setLoaded({ item, scopeKey, blob, status: blob ? "ready" : request.kind === "remote" ? "error" : "missing", errorCode: "" });
      } catch (error) {
        if (active) setLoaded({ item, scopeKey, blob: null, status: "error", errorCode: error?.code ?? "" });
      }
    });
    return () => { active = false; };
  }, [enabled, item, scope, scopeKey, retryVersion]);
  const setImage = useCallback((image) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (image && state.blob) {
      objectUrlRef.current = URL.createObjectURL(state.blob);
      image.src = objectUrlRef.current;
    }
  }, [state.blob]);
  if (state.status === "decode-error") return createElement("span", { className: "gallery-missing" },
    item.uploadReady === false ? "Soubor je zachovaný, ale nepodporuje ho prohlížeč ani synchronizace. Převeď ho a nahraď." : "Fotografii se v tomto zařízení nepodařilo zobrazit.",
    createElement("br"), createElement(Link, { to: `/catch/${item.catchId}/edit` }, "Upravit úlovek"));
  if (availability === PHOTO_AVAILABILITY.PENDING || availability === PHOTO_AVAILABILITY.SYNCING) {
    return createElement(PhotoSyncStatus, { className: "gallery-missing gallery-photo-sync-status" });
  }
  if (!state.blob) return createElement("span", { className: "gallery-missing" },
    availability === PHOTO_AVAILABILITY.BROKEN || availability === PHOTO_AVAILABILITY.RETRYABLE_ERROR
      ? state.errorCode === "cloudinary_asset_missing" || item?.cloud?.state === "unavailable"
        ? createElement(Link, { to: `/catch/${item.catchId}/edit` }, getGalleryMissingMessage(item, state.errorCode))
        : state.errorCode === "photo_local_blob_unreadable"
          ? createElement(Link, { to: `/catch/${item.catchId}/edit` }, "Fotografii se na tomto zařízení nepodařilo přečíst. Nahraď ji.")
          : state.status === "error"
            ? createElement("span", null, "Fotografii se nepodařilo načíst. ", createElement("button", { type: "button", onClick: () => {
          setLoaded({ item, scopeKey, blob: null, status: "loading", errorCode: "" });
          setRetryVersion((version) => version + 1);
        } }, "Zkusit znovu"))
            : getGalleryMissingMessage(item, state.errorCode)
      : state.status === "loading" ? "Načítám fotografii…" : getGalleryMissingMessage(item, state.errorCode));
  // The callback ref only creates the object URL once the DOM image is mounted.
  // eslint-disable-next-line react-hooks/refs
  return createElement("img", { ref: setImage, style, alt, loading, onError: () => {
    setLoaded({ item, scopeKey, blob: null, status: "decode-error", errorCode: "" });
  } });
}
