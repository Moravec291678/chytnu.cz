import { FieldPath } from "firebase-admin/firestore";
import { socialUid } from "../data/socialModel.js";

const fail = code => { throw new TypeError(code); };
// No friend-list fanout: each request reads at most 21 indexed candidates and
// authorizes at most 20 against current profile, friendship, source and blocks.
export function createSocialFeedService({ db, publications, cursors }) {
  return {
    async list(uid, { mode = "global", cursor, limit = 10 } = {}) {
      if (!uid) throw Object.assign(new Error("authentication_required"), { status: 401 });
      socialUid(uid);
      if (!["global", "friends"].includes(mode) || ![3, 10].includes(limit)) fail("invalid_request");
      const context = `feed:${uid}:${mode}:${limit}`, after = cursors.decode(cursor, context);
      let query = db.collection("socialPosts");
      query = mode === "global" ? query.where("visibility", "==", "public") : query.where("visibility", "in", ["public", "friends"]);
      query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
      if (after) {
        const match = /^(\d{1,16})_([a-f0-9]{64})$/.exec(after);
        if (!match || !Number.isSafeInteger(Number(match[1]))) fail("invalid_cursor");
        query = query.startAfter(Number(match[1]), match[2]);
      }
      return db.runTransaction(async tx => {
        await publications.guard(tx, uid, "feed");
        const page = await tx.get(query.limit(21)), posts = [];
        let consumed = 0, boundary;
        for (const snapshot of page.docs.slice(0, 20)) {
          consumed++; boundary = snapshot;
          const row = snapshot.data();
          if (row.id !== snapshot.id || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0) continue;
          if (mode === "friends" && row.ownerUid === uid) continue;
          const allowed = await publications.permitted(tx, uid, row, row.ownerUid === uid ? { previewAudience: "stranger" } : {});
          const section = publications.section(row);
          const globallyVisible = allowed?.profile.visibility === "public" && allowed.profile.sections?.[section] === "public";
          if (allowed && (mode === "friends" ? allowed.audience === "friend" : globallyVisible)) posts.push(publications.dto(allowed));
          if (posts.length === limit) break;
        }
        // The boundary is opaque and independent of authorization. Empty pages
        // can continue past revoked/deleted candidates without revealing them.
        const hasMore = consumed < page.size;
        const stamp = boundary?.data().createdAt;
        if (hasMore && (!Number.isSafeInteger(stamp) || stamp < 0 || !/^[a-f0-9]{64}$/.test(boundary.id))) throw new Error("social_unavailable");
        return { posts, nextCursor: hasMore ? cursors.encode(`${stamp}_${boundary.id}`, context) : null };
      });
    },
  };
}
