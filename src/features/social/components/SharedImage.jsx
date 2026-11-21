import { useEffect, useState } from "react";
import { socialRequest } from "../data/socialClient.js";
import "./SharedImage.css";

export function SharedImage({ profile, photo, avatar = false }) {
  const key = `${profile.uid}:${profile.avatarVersion ?? ""}:${avatar ? "avatar" : `${photo.catchId}:${photo.photoId}`}`;
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    socialRequest("image", { identity: profile.uid, kind: avatar ? "avatar" : "catch", ...(!avatar ? photo : {}) }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setLoaded({ key, data: value.jpegBase64 }); })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ key, data: null }); });
    return () => controller.abort();
  }, [key, profile.uid, avatar, photo]);
  return loaded?.key === key && loaded.data
    ? <img src={`data:image/jpeg;base64,${loaded.data}`} alt={avatar ? `Avatar rybáře ${profile.displayName}` : "Výslovně sdílená fotografie úlovku"} />
    : <span className="social-image-placeholder" aria-label={avatar ? "Profilová fotografie" : "Fotografie není dostupná"}>{avatar ? profile.displayName?.charAt(0) || "🎣" : "▧"}</span>;
}
