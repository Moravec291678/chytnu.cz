import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { getGalleryMissingMessage, getGalleryPhotoLoadRequest } from "../features/catches/data/catchGallery.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import { recordPhotoUploadTrace } from "../features/catches/data/photoUploadTrace.js";
import { getPhotoAvailability, PHOTO_AVAILABILITY } from "../features/catches/data/photoAvailability.js";
import PhotoSyncStatus from "../features/catches/components/PhotoSyncStatus.js";
import { Link } from "react-router-dom";

export function GalleryPhotoFailure({ item, tile = false, permanent = false, message = "", onRetry }) {
  return createElement("span", { className: "gallery-missing gallery-photo-broken", role: "status", "aria-label": "Fotografii se nepodařilo načíst" },
    createElement("span", null, tile ? "Nelze načíst" : "Fotografii se nepodařilo načíst"),
    permanent
      ? createElement(Link, { to: `/catch/${item.catchId}/edit` }, tile ? "Upravit" : message)
      : createElement("button", { type: "button", onClick: onRetry, "aria-label": "Zkusit znovu načíst fotografii" }, "Zkusit znovu"));
}

export default function GalleryPhotoImage({ item, scope = null, style, alt, loading, enabled = true, tile = false }) {
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
  const retry = () => {
    setLoaded({ item, scopeKey, blob: null, status: "loading", errorCode: "" });
    setRetryVersion((version) => version + 1);
  };
  if (state.status === "decode-error") return createElement("span", { className: "gallery-missing gallery-photo-broken", role: "status", "aria-label": "Fotografii se nepodařilo načíst" },
    createElement("span", null, tile ? "Nelze načíst" : "Fotografii se v tomto zařízení nepodařilo zobrazit."),
    createElement(Link, { to: `/catch/${item.catchId}/edit` }, tile ? "Upravit" : "Upravit úlovek"));
  if (availability === PHOTO_AVAILABILITY.PENDING || availability === PHOTO_AVAILABILITY.SYNCING) {
    return createElement(PhotoSyncStatus, { className: "gallery-missing gallery-photo-sync-status" });
  }
  if (!state.blob) {
    const permanent = availability === PHOTO_AVAILABILITY.BROKEN
      || state.errorCode === "cloudinary_asset_missing" || state.errorCode === "photo_local_blob_unreadable"
      || item?.cloud?.state === "unavailable";
    if (permanent || availability === PHOTO_AVAILABILITY.RETRYABLE_ERROR) {
      return createElement(GalleryPhotoFailure, { item, tile, permanent,
        message: getGalleryMissingMessage(item, state.errorCode), onRetry: retry });
    }
    return createElement("span", { className: "gallery-missing" },
      state.status === "loading" ? "Načítám…" : tile ? "Nelze načíst" : getGalleryMissingMessage(item, state.errorCode));
  }
  // The callback ref only creates the object URL once the DOM image is mounted.
  // eslint-disable-next-line react-hooks/refs
  return createElement("img", { ref: setImage, style, alt, loading, onLoad: () => {
    recordPhotoUploadTrace(item.id, "photo_image_rendered", { catchId: item.catchId });
  }, onError: () => {
    recordPhotoUploadTrace(item.id, "photo_image_decode_fail", { catchId: item.catchId, errorCode: "photo_decode_failed" });
    setLoaded({ item, scopeKey, blob: null, status: "decode-error", errorCode: "" });
  } });
}
