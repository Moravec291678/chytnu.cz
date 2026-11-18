import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";

/** A feed lives only in memory and is discarded when its audience changes. */
export function useSocialFeed({ mode = "global", limit = 10, enabled = true, postId, autoRefresh = true }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const online = useSocialConnection();
  const key = `${uid ?? "anonymous"}:${mode}:${limit}:${postId ?? "feed"}`;
  const [result, setResult] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [busyKey, setBusyKey] = useState(null);
  const loadRef = useRef(null);
  const needsAuth = !postId && !uid;
  const canRead = enabled && !needsAuth;
  const reload = useCallback(() => {
    loadRef.current?.abort();
    setBusyKey(null);
    setResult(null);
    setRefresh(value => value + 1);
  }, []);

  useEffect(() => {
    // Reconnection must not briefly restore rows whose permission may have expired.
    window.addEventListener("online", reload);
    window.addEventListener("offline", reload);
    return () => { window.removeEventListener("online", reload); window.removeEventListener("offline", reload); };
  }, [reload]);

  useEffect(() => {
    if (!canRead || !online) return undefined;
    const controller = new AbortController();
    loadRef.current = controller;
    socialRequest(postId ? "posts.view" : "feed.list", postId ? { postId } : { mode, limit }, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ key, posts: postId ? [value.post].filter(Boolean) : value.posts, nextCursor: value.nextCursor, refresh }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message, refresh }); });
    return () => { controller.abort(); loadRef.current?.abort(); };
  }, [canRead, online, key, mode, limit, postId, refresh]);

  useEffect(() => {
    if (!canRead || !online || !autoRefresh) return undefined;
    const revalidate = () => { if (document.visibilityState !== "hidden") reload(); };
    const timer = setInterval(revalidate, 45_000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { clearInterval(timer); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [canRead, online, reload, autoRefresh]);

  const current = canRead && online && result?.key === key && result.refresh === refresh ? result : null;
  async function more() {
    if (!current?.nextCursor || busyKey === `${key}:${refresh}` || !online) return;
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    setBusyKey(`${key}:${refresh}`);
    try {
      const value = await socialRequest("feed.list", { mode, limit, cursor: current.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(old => old?.key === key && old.refresh === refresh ? { ...old, posts: [...new Map([...old.posts, ...value.posts].map(post => [post.id, post])).values()], nextCursor: value.nextCursor, moreError: null } : old);
    } catch (error) {
      if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, moreError: error.message } : old);
    } finally { if (!controller.signal.aborted) setBusyKey(old => old === `${key}:${refresh}` ? null : old); }
  }
  return { current, online, needsAuth, reload, more, loadingMore: busyKey === `${key}:${refresh}`, refreshKey: `${key}:${refresh}` };
}
