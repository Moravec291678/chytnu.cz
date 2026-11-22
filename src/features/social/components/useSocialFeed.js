import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context/authContextValue.js";
import { socialRequest } from "../data/socialClient.js";
import { useSocialConnection } from "./useSocialConnection.js";

/** A feed lives only in memory and is discarded when its audience changes. */
export function useSocialFeed({ mode = "global", limit = 10, enabled = true, postId, catalogueId, autoRefresh = true }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const online = useSocialConnection();
  const key = `${uid ?? "anonymous"}:${mode}:${limit}:${postId ?? catalogueId ?? "feed"}`;
  const [result, setResult] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [busyKey, setBusyKey] = useState(null);
  const loadRef = useRef(null);
  const nextPageRef = useRef(null);
  const lastReadAt = useRef(0);
  const needsAuth = !postId && !uid;
  const canRead = enabled && !needsAuth;
  const reload = useCallback(() => {
    loadRef.current?.abort();
    nextPageRef.current = null;
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
    lastReadAt.current = Date.now();
    const action = postId ? "posts.view" : catalogueId ? "waterCommunity.list" : "feed.list";
    const payload = postId ? { postId } : catalogueId ? { catalogueId } : { mode, limit };
    socialRequest(action, payload, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ key, posts: postId ? [value.post].filter(Boolean) : value.posts, nextCursor: value.nextCursor, refresh }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, error: error.message, refresh }); });
    return () => { controller.abort(); loadRef.current?.abort(); nextPageRef.current = null; };
  }, [canRead, online, key, mode, limit, postId, catalogueId, refresh]);

  useEffect(() => {
    if (!canRead || !online || !autoRefresh) return undefined;
    const revalidate = () => {
      // Returning to a tab can emit visibility and focus for the same transition.
      const now = Date.now();
      if (document.visibilityState === "hidden" || now - lastReadAt.current < 1000) return;
      lastReadAt.current = now;
      reload();
    };
    const timer = setInterval(revalidate, 45_000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => { clearInterval(timer); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); };
  }, [canRead, online, reload, autoRefresh]);

  const current = canRead && online && result?.key === key && result.refresh === refresh ? result : null;
  async function more() {
    if (!current?.nextCursor || nextPageRef.current || !online) return;
    loadRef.current?.abort();
    const controller = new AbortController();
    loadRef.current = controller;
    nextPageRef.current = controller;
    setBusyKey(`${key}:${refresh}`);
    try {
      const value = await socialRequest(catalogueId ? "waterCommunity.list" : "feed.list",
        { ...(catalogueId ? { catalogueId } : { mode, limit }), cursor: current.nextCursor }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(old => old?.key === key && old.refresh === refresh ? { ...old, posts: [...new Map([...old.posts, ...value.posts].map(post => [post.id, post])).values()], nextCursor: value.nextCursor, moreError: null } : old);
    } catch (error) {
      if (!controller.signal.aborted) setResult(old => old?.key === key ? { ...old, moreError: error.message } : old);
    } finally {
      if (nextPageRef.current === controller) nextPageRef.current = null;
      if (!controller.signal.aborted) setBusyKey(old => old === `${key}:${refresh}` ? null : old);
    }
  }
  return { current, online, needsAuth, reload, more, loadingMore: busyKey === `${key}:${refresh}`, refreshKey: `${key}:${refresh}` };
}
