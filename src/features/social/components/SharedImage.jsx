import { useEffect, useState } from "react";
import { socialRequest } from "../data/socialClient.js";
import { useAuth } from "../../auth/context/authContextValue.js";
import { useNearViewport } from "../../../shared/hooks/useNearViewport.js";
import { ViewerImage } from "../../../shared/components/PhotoViewer.jsx";
import "./SharedImage.css";

export function SharedImage({ profile, photo, avatar = false, full = false }) {
  const { user } = useAuth();
  const catchId = photo?.catchId;
  const photoId = photo?.photoId;
  const key = JSON.stringify([user?.uid, profile.uid, profile.avatarVersion, avatar, catchId, photoId]);
  const [loaded, setLoaded] = useState(null);
  const [ref, near] = useNearViewport({ immediate: full });
  useEffect(() => {
    if (!near) return undefined;
    const controller = new AbortController();
    socialRequest("image", { identity: profile.uid, kind: avatar ? "avatar" : "catch", ...(!avatar ? { catchId, photoId } : {}) }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setLoaded({ key, data: value.jpegBase64 }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null }); });
    return () => controller.abort();
  }, [near, key, profile.uid, avatar, catchId, photoId]);
  if (full) return loaded?.key === key
    ? <ViewerImage src={loaded.data ? `data:image/jpeg;base64,${loaded.data}` : null} alt="Výslovně sdílená fotografie úlovku" />
    : <p className="photo-viewer-status" role="status">Načítám fotografii…</p>;
  return loaded?.key === key && loaded.data
    ? <img decoding="async" src={`data:image/jpeg;base64,${loaded.data}`} alt={avatar ? `Avatar rybáře ${profile.displayName}` : "Výslovně sdílená fotografie úlovku"} />
    : <span ref={ref} className="social-image-placeholder" aria-label={avatar ? "Profilová fotografie" : "Fotografie není dostupná"}>{avatar ? profile.displayName?.charAt(0) || "🎣" : "▧"}</span>;
}
