import { FEATURES } from "../../../product/config/featureFlags.js";
import { createPublicProfileService } from "./publicProfileService.js";
import { createSocialAvatarService } from "./socialAvatar.js";
import { createSocialPhotoService } from "./socialPhoto.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";
const actions = { friends: ["tab", "cursor"], "friends.status": ["targetUid"], search: ["query", "field", "mode", "cursor"], relationship: ["targetUid", "operation", "operationId", "expectedRevision"], self: [], save: ["profile", "publicationConsent"], view: ["identity"], preview: ["audience"], block: ["targetUid", "blocked"], report: ["targetUid", "reason"],
  "interactions.list": ["postId", "cursor"], "reactions.set": ["postId", "kind", "operationId"], "comments.save": ["postId", "commentId", "text", "expectedRevision"], "comments.delete": ["postId", "commentId", "expectedRevision"], "reports.create": ["postId", "commentId", "reason", "details"],
  "posts.save": ["catchId","photoId","visibility","fields","description","expectedRevision"], "posts.own": ["catchId"], "posts.list": ["identity","cursor","previewAudience"], "posts.image": ["postId","previewAudience"], "posts.delete": ["postId","expectedRevision"],
  "progression.compare": ["targetUid"],
  "posts.publishNew": [],
  "feed.list": ["mode","cursor","limit"],"posts.view":["postId"],
  "nearby.join": ["latitude", "longitude"], "nearby.leave": [], "nearby.consent": ["accepted", "showProfile"], "nearby.status": [], "nearby.discover": [], "nearby.waterActivity": ["catalogueId"],
  "waterPresence.status": [], "waterPresence.join": ["waterId", "confirmed", "expectedSessionId"],
  "waterPresence.refresh": ["sessionId"], "waterPresence.leave": ["sessionId"],
  "waterChat.send": ["waterId", "sessionId", "text", "operationId"], "waterChat.list": ["waterId", "sessionId", "cursor"],
  "waterChat.report": ["waterId", "sessionId", "messageId", "reason"],
  "dm.send": ["targetUid", "text", "operationId"], "dm.list": ["targetUid", "cursor"], "dm.conversations": ["cursor"],
  "dm.read": ["targetUid", "revision"], "dm.delete": ["targetUid", "messageId"], "dm.report": ["targetUid", "messageId", "reason"],
  "crew.create": ["name", "operationId"], "crew.list": ["mode", "cursor"], "crew.report": ["crewId", "reason"],
  "crew.view": ["crewId"],
  "crew.change": ["crewId", "operation", "targetUid", "visibility", "enabled", "expectedRevision"],
  "entries.save":["entryId","kind","visibility","expectedRevision","title","description","achievementId"],
  "avatar.set": ["jpegBase64"], "avatar.remove": [], image: ["identity", "kind", "catchId", "photoId"] };
const errors = { unauthenticated: 401, authentication_required: 401, account_unavailable: 403, forbidden: 403,
  invalid_consent: 400, publication_consent_required: 403, consent_conflict: 409,
  invalid_publication:400,post_unavailable:404,post_conflict:409,interaction_conflict:409,comment_unavailable:404,comment_conflict:409,comment_duplicate:429,invalid_interaction:400,photo_preparing:409,photo_unavailable:503,
  social_disabled: 503, social_unavailable: 404, profile_unavailable: 404, social_rate_limit: 429, request_limit: 429,
  handle_taken: 409, invalid_profile: 400, invalid_shared_catch: 400, invalid_shared_photo: 400, invalid_request: 400,
  consent_required: 403, water_presence_required: 403, water_presence_conflict: 409, message_conflict: 409, message_unavailable: 404, crew_conflict: 409,
  save_profile_first: 400, invalid_avatar: 400, avatar_unavailable: 503, invalid_search: 400, invalid_cursor: 400, profile_required: 409, discovery_unavailable: 503, relationship_conflict: 409 };
function isAvailable(action, payload, features) {
  // Leave and consent withdrawal must work for stale clients after a rollout closes.
  if (action === "nearby.leave" || action === "waterPresence.leave") return true;
  if (action === "nearby.consent" && payload.accepted === false) return true;
  if (action.startsWith("nearby.")) return features.nearby === true;
  if (action.startsWith("waterPresence.")) return features.waterPresence === true;
  if (action.startsWith("waterChat.")) return features.waterPresence === true && features.waterChat === true;
  if (action.startsWith("dm.")) return features.directMessages === true;
  if (action.startsWith("crew.")) return features.crew === true;
  return true;
}
export function createSocialHandler({ service, features = FEATURES }) {
  return async (req, res) => {
    res.setHeader?.("Cache-Control", "private, no-store, max-age=0");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    try {
      if (JSON.stringify(req.body ?? null).length > 280_000) return res.status(413).json({ error: "request_too_large" });
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(actions, body.action)
        || Object.keys(body).some(k => !["action", ...actions[body.action]].includes(k))) return res.status(400).json({ error: "invalid_request" });
      if (body.action !== "avatar.set" && JSON.stringify(body).length > 20_000) return res.status(413).json({ error: "request_too_large" });
      const header = req.headers?.authorization;
      const token = header?.match(/^Bearer ([^\s]+)$/)?.[1] ?? null;
      if (header && !token) return res.status(401).json({ error: "authentication_required" });
      const { action, ...payload } = body;
      if (!isAvailable(action, payload, features)) return res.status(404).json({ error: "social_unavailable" });
      return res.status(200).json(await service.execute(action, payload, token));
    } catch (error) {
      const code = Object.hasOwn(errors, error?.code ?? "") ? error.code : Object.hasOwn(errors, error?.message ?? "") ? error.message
        : error instanceof TypeError || error instanceof SyntaxError ? "invalid_request" : "social_unavailable";
      return res.status(errors[code] ?? 503).json({ error: code });
    }
  };
}
export async function createProductionSocialHandler({ env = globalThis.process?.env ?? {} } = {}) {
  const { db, auth } = await getAccountDeletionAdminContext(env);
  return createSocialHandler({ service: createPublicProfileService({ db, auth, env,
    avatar: createSocialAvatarService({ env }), socialPhoto: createSocialPhotoService({ env }) }) });
}
