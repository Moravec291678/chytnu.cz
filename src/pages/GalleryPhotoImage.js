import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { getGalleryMissingMessage, getGalleryPhotoLoadRequest } from "../features/catches/data/catchGallery.js";
import { getPhotoBlobForDisplay } from "../features/catches/data/photoCloudService.js";
import { Link } from "react-router-dom";

export default function GalleryPhotoImage({ item, scope = null, style, alt, loading, enabled = true }) {
  const [loaded, setLoaded] = useState(null);
  const objectUrlRef = useRef(null);
  const scopeKey = scope?.scopeKey ?? null;
  const initialRequest = getGalleryPhotoLoadRequest(item, scope);
  const isCurrent = loaded?.item === item && loaded.scopeKey === scopeKey;
  const state = isCurrent
    ? loaded
    : { blob: initialRequest.kind === "local" ? initialRequest.blob : null,
      status: !enabled ? "idle" : initialRequest.kind === "remote" ? "loading" : "missing" };
  useEffect(() => {
    let active = true;
    if (!enabled) return undefined;
    Promise.resolve().then(async () => {
      try {
        const request = getGalleryPhotoLoadRequest(item, scope);
        const blob = request.kind === "local" ? request.blob
          : request.kind === "remote" ? await getPhotoBlobForDisplay(request.options) : null;
        if (active) setLoaded({ item, scopeKey, blob, status: blob ? "ready" : "missing", errorCode: "" });
      } catch (error) {
        if (active) setLoaded({ item, scopeKey, blob: null, status: "missing", errorCode: error?.code ?? "" });
      }
    });
    return () => { active = false; };
  }, [enabled, item, scope, scopeKey]);
  const setImage = useCallback((image) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (image && state.blob) {
      objectUrlRef.current = URL.createObjectURL(state.blob);
      image.src = objectUrlRef.current;
    }
  }, [state.blob]);
  if (!state.blob) return createElement("span", { className: "gallery-missing" }, state.status === "loading" ? "Načítám fotografii…"
    : state.errorCode === "cloudinary_asset_missing" ? createElement(Link, { to: `/catch/${item.catchId}/edit` }, getGalleryMissingMessage(item, state.errorCode))
      : getGalleryMissingMessage(item, state.errorCode));
  // The callback ref only creates the object URL once the DOM image is mounted.
  // eslint-disable-next-line react-hooks/refs
  return createElement("img", { ref: setImage, style, alt, loading });
}
