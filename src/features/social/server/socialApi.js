import { createPublicProfileService } from "./publicProfileService.js";
import { createSocialAvatarService } from "./socialAvatar.js";
import { createSocialPhotoService } from "./socialPhoto.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";
const actions = { friends: ["tab", "cursor"], "friends.status": ["targetUid"], search: ["query", "field", "mode", "cursor"], relationship: ["targetUid", "operation", "operationId", "expectedRevision"], self: [], save: ["profile"], view: ["identity"], preview: ["audience"], block: ["targetUid", "blocked"], report: ["targetUid", "reason"],
  "posts.save": ["catchId","photoId","visibility","fields","description","expectedRevision"], "posts.own": ["catchId"], "posts.list": ["identity","cursor","previewAudience"], "posts.image": ["postId","previewAudience"], "posts.delete": ["postId","expectedRevision"],
  "avatar.set": ["jpegBase64"], "avatar.remove": [], image: ["identity", "kind", "catchId", "photoId"] };
const errors = { unauthenticated: 401, authentication_required: 401, account_unavailable: 403, forbidden: 403,
  invalid_publication:400,post_unavailable:404,post_conflict:409,photo_preparing:409,photo_unavailable:503,
  social_disabled: 503, social_unavailable: 404, profile_unavailable: 404, social_rate_limit: 429, request_limit: 429,
  handle_taken: 409, invalid_profile: 400, invalid_shared_catch: 400, invalid_shared_photo: 400, invalid_request: 400,
  save_profile_first: 400, invalid_avatar: 400, avatar_unavailable: 503, invalid_search: 400, invalid_cursor: 400, profile_required: 409, discovery_unavailable: 503, relationship_conflict: 409 };
export function createSocialHandler({ service }) {
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
