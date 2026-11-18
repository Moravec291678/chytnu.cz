import { Link, useParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../features/auth/context/authContextValue.js";
import { socialRequest } from "../features/social/data/socialClient.js";
import CommunityEntryComposer from "../features/social/components/CommunityEntryComposer.jsx";
import Layout from "../shared/layout/Layout.jsx";
import { SocialFeedState, SocialPostCard } from "../features/social/components/SocialFeed.jsx";
import { useSocialFeed } from "../features/social/components/useSocialFeed.js";
import "./CommunityPage.css";

export default function CommunityPostPage() {
  const { postId } = useParams();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const feed = useSocialFeed({ postId, autoRefresh: !editing });
  const key = `${user?.uid ?? "anonymous"}:${postId}`;
  const [action, setAction] = useState(null);
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), [key]);
  async function remove(post) {
    if (action?.key === key && action.busy) return;
    const controller = new AbortController(); controllerRef.current = controller;
    setAction({ key, busy: true });
    try {
      await socialRequest("posts.delete", { postId: post.id, expectedRevision: post.revision }, { signal: controller.signal });
      if (!controller.signal.aborted) { setAction({ key, deleted: true }); feed.reload(); }
    } catch (error) { if (!controller.signal.aborted) setAction({ key, error: error.message }); }
  }
  return <Layout><div className="community-page"><div className="online-feed-heading"><Link to="/community">← Komunita</Link><button type="button" disabled={!feed.online} onClick={feed.reload}>Obnovit</button></div>{action?.key === key && action.deleted ? <p role="status" className="online-feed-state">Příspěvek byl odstraněn.</p> : <SocialFeedState feed={feed}><div>{feed.current?.posts?.map(post => <div key={`${post.id}:${post.revision}`}><SocialPostCard post={post} detail refreshKey={feed.refreshKey} />{post.kind && post.kind !== "catch" && user?.uid === post.author.uid && <><CommunityEntryComposer initialPost={post} onOpenChange={setEditing} onPublished={() => { setEditing(false); feed.reload(); }} /><details className="community-entry-composer"><summary>Odstranit můj příspěvek</summary><div className="community-entry-body"><p>Odstraněním přestane být příspěvek dostupný čtenářům.</p><button type="button" disabled={!feed.online || action?.key === key && action.busy} onClick={() => remove(post)}>Odstranit příspěvek</button></div></details></>}</div>)}</div></SocialFeedState>}{action?.key === key && action.error && <p role="alert" className="online-feed-state">{action.error} Obnov příspěvek a zkus to znovu.</p>}</div></Layout>;
}
