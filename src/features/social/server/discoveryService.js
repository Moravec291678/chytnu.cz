import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { FieldPath } from "firebase-admin/firestore";
import { validateDiscoveryRequest } from "../data/discoveryModel.js";
const invalidCursor = () => { throw new TypeError("invalid_cursor"); };
export function createDiscoveryService({ db, repository, project, env = {}, cursorSecret, now = () => Date.now() }) {
  function key() {
    let secret = cursorSecret;
    if (!secret) { try { secret = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}").private_key; } catch { /* Fail closed below. */ } }
    if (typeof secret !== "string" || secret.length < 32) throw Object.assign(new Error("discovery_unavailable"), { code: "discovery_unavailable", status: 503 });
    return createHash("sha256").update("chytnucz-discovery-cursor-v1\n").update(secret).digest();
  }
  const context = (uid, request) => `${uid}:${request.mode}:${request.field}:${request.query}`;
  function encode(uid, request, boundary) {
    const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), nonce);
    const body = Buffer.from(JSON.stringify({ context: context(uid, request), boundary, expiresAt: now() + 15 * 60_000 }));
    return Buffer.concat([nonce, cipher.update(body), cipher.final(), cipher.getAuthTag()]).toString("base64url");
  }
  function decode(uid, request) {
    if (!request.cursor) return null;
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(request.cursor)) return invalidCursor();
      const bytes = Buffer.from(request.cursor, "base64url");
      if (bytes.length < 30) return invalidCursor();
      const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(-16));
      const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)), decipher.final()]).toString("utf8"));
      if (data.context !== context(uid, request) || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now()) return invalidCursor();
      const boundary = data.boundary;
      if (!boundary || typeof boundary.uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(boundary.uid)) return invalidCursor();
      if (request.mode === "search" && (typeof boundary.handle !== "string" || boundary.handle.length > 128)) return invalidCursor();
      if (request.mode === "new" && (!Number.isSafeInteger(boundary.createdAt) || boundary.createdAt < 0 || boundary.createdAt > now())) return invalidCursor();
      return boundary;
    } catch { return invalidCursor(); }
  }
  return { async search(token, uid, input) {
    const request = validateDiscoveryRequest(input), boundary = decode(uid, request);
    // Verify configuration even for single/empty pages, not only after a full page.
    key();
    let query = db.collection("publicProfiles").where("visibility", "==", "public").where("discoverable", "==", true)
      .where("searchPrefixes", "array-contains", request.token);
    if (request.mode === "new") query = query.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "asc");
    else query = query.orderBy("handle", "asc").orderBy(FieldPath.documentId(), "asc");
    if (boundary) query = query.startAfter(request.mode === "new" ? boundary.createdAt : boundary.handle, boundary.uid);
    const page = await repository.searchProfiles(token, query.limit(11), request.token, project);
    return { users: page.users, nextCursor: page.hasMore && page.boundary ? encode(uid, request, page.boundary) : null };
  } };
}
