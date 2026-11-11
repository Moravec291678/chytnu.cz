import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { FieldPath } from "firebase-admin/firestore";
export function createFriendsService({ db, repository, project, env = {}, cursorSecret, now = () => Date.now() }) {
  function key() {
    let secret = cursorSecret;
    if (!secret) { try { secret = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}").private_key; } catch { /* Reject below. */ } }
    if (typeof secret !== "string" || secret.length < 32) throw new Error("discovery_unavailable");
    return createHash("sha256").update("chytnucz-friends-cursor-v1\n").update(secret).digest();
  }
  return { async list(token, uid, payload) {
    const tab = payload.tab ?? "friends";
    if (!["friends", "incoming", "outgoing"].includes(tab)) throw new TypeError("invalid_request");
    const context = `${uid}:${tab}`, cursorKey = key(); let after = null;
    if (payload.cursor !== undefined && payload.cursor !== null) {
      try {
        if (typeof payload.cursor !== "string" || payload.cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(payload.cursor)) throw new Error();
        const bytes = Buffer.from(payload.cursor, "base64url"), decipher = createDecipheriv("aes-256-gcm", cursorKey, bytes.subarray(0,12));
        decipher.setAuthTag(bytes.subarray(-16));
        const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)), decipher.final()]).toString());
        if (data.context !== context || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now() || !/^[A-Za-z0-9_-]{1,300}$/.test(data.after)) throw new Error();
        after = data.after;
      } catch { throw new TypeError("invalid_cursor"); }
    }
    let query = db.collection("socialRelationships").where("memberUids", "array-contains", uid)
      .where("status", "==", tab === "friends" ? "accepted" : "pending").orderBy(FieldPath.documentId());
    if (after) query = query.startAfter(after);
    const result = await repository.friendsPage(token, query.limit(11), tab, project);
    let nextCursor = null;
    if (result.hasMore && result.boundary) {
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", cursorKey, nonce);
      nextCursor = Buffer.concat([nonce, cipher.update(JSON.stringify({ context, after: result.boundary, expiresAt: now() + 15*60_000 })), cipher.final(), cipher.getAuthTag()]).toString("base64url");
    }
    return { users: result.users, nextCursor };
  } };
}
