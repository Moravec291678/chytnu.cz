// Social DTOs deliberately do not accept private catch objects, URLs, GPS or roles.
export const SOCIAL_VISIBILITY = Object.freeze({ PUBLIC: "public", FRIENDS: "friends", PRIVATE: "private" });
export const SOCIAL_PATHS = Object.freeze({ profiles: "publicProfiles", handles: "publicHandles", relationships: "socialRelationships",
  posts: "socialPosts", blocks: "socialBlocks", nearby: "nearbyPresence", presence: "waterPresence", rooms: "waterRooms",
  conversations: "privateConversations", crews: "crews", notifications: uid => `users/${socialUid(uid)}/notifications` });
export function socialUid(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new TypeError("Invalid social UID");
  return value;
}
export function normalizedHandle(value) {
  if (typeof value !== "string") throw new TypeError("Invalid handle");
  const handle = value.normalize("NFKC").toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(handle)) throw new TypeError("Invalid handle");
  return handle;
}
export function canonicalPair(a, b) {
  socialUid(a); socialUid(b);
  if (a === b) throw new TypeError("Self relationship");
  // Length prefixes avoid collisions for UIDs containing separators.
  return [a, b].sort().map(uid => `${uid.length}_${uid}`).join("_");
}
export function canonicalWater(value) {
  if (typeof value !== "string" || !/^ris-[a-f0-9]{24}$/.test(value)) throw new TypeError("Canonical RIS ID required");
  return value;
}
export function canReadSocial({ viewerUid, ownerUid, visibility = "private", friends = false, blocked = false, unavailable = false }) {
  if (!viewerUid || blocked || unavailable) return false;
  return viewerUid === ownerUid || visibility === "public" || (visibility === "friends" && friends);
}
const text = max => v => typeof v === "string" && v.trim().length > 0 && v.length <= max && !Array.from(v).some(c => c.charCodeAt(0) < 32);
const uid = v => { try { return socialUid(v) === v; } catch { return false; } };
const water = v => { try { return canonicalWater(v) === v; } catch { return false; } };
const oneOf = values => v => values.includes(v);
const visibility = oneOf(Object.values(SOCIAL_VISIBILITY));
const members = v => Array.isArray(v) && v.length >= 1 && v.length <= 20 && new Set(v).size === v.length && v.every(uid);
const schema = {
  profile: { uid, handle: v => { try { return normalizedHandle(v) === v; } catch { return false; } }, displayName: text(60), bio: v => v === "" || text(280)(v), visibility },
  handle: { uid },
  relationship: { memberUids: v => members(v) && v.length === 2, requestedBy: uid, status: oneOf(["pending", "accepted"]) },
  post: { ownerUid: uid, visibility, text: text(2000), waterId: water },
  comment: { ownerUid: uid, text: text(1000) },
  reaction: { ownerUid: uid, kind: oneOf(["like", "congratulations"]) },
  block: { ownerUid: uid, targetUid: uid },
  nearby: { ownerUid: uid, coarseCell: v => typeof v === "string" && /^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/.test(v), expiresAt: Number.isSafeInteger },
  presence: { ownerUid: uid, waterId: water, expiresAt: Number.isSafeInteger },
  room: { waterId: water },
  message: { ownerUid: uid, text: text(1000) },
  conversation: { memberUids: v => members(v) && v.length === 2 },
  crew: { ownerUid: uid, memberUids: members, name: text(60), visibility },
};
const optional = { profile: ["bio"], post: ["waterId"] };
export function validateSocialRecord(kind, input, { now = Date.now() } = {}) {
  const fields = schema[kind];
  if (!fields || !input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid social record");
  const base = { createdAt: Number.isSafeInteger, updatedAt: Number.isSafeInteger, ...fields };
  if (Object.keys(input).some(k => !Object.hasOwn(base, k)) || Object.entries(base).some(([k, check]) =>
    !(optional[kind]?.includes(k) && input[k] === undefined) && !check(input[k]))) throw new TypeError("Invalid social fields");
  if (input.createdAt > now || input.updatedAt > now || input.createdAt < 0 || input.updatedAt < input.createdAt) throw new TypeError("Invalid social timestamp");
  if (kind === "relationship" && !input.memberUids.includes(input.requestedBy)) throw new TypeError("Invalid requester");
  if (kind === "block" && input.ownerUid === input.targetUid) throw new TypeError("Self block");
  if (kind === "crew" && !input.memberUids.includes(input.ownerUid)) throw new TypeError("Invalid crew owner");
  if (["nearby", "presence"].includes(kind) && (input.expiresAt <= now || input.expiresAt > now + 30 * 60_000)) throw new TypeError("Invalid presence expiry");
  return structuredClone(input);
}
