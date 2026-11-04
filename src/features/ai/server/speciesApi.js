import { hasAiConsent } from "../aiPolicy.js";
import { validateSpeciesSuggestion } from "../speciesSuggestion.js";

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const send = (res, status, error) => { res.setHeader?.("Cache-Control", "no-store"); return res.status(status).json(error); };

// Adapter contract: getOwnedPhoto must return decoded/re-encoded image bytes without EXIF,
// loaded by owner-scoped server identity, not a URL supplied by the caller.
// Rate consumption must be persistent/atomic (e.g. the existing Firestore transaction pattern).
// Fail closed when any dependency or release gate is absent.
export function createSpeciesApi({ enabled = false, providerName, verifyToken, getConsent, getOwnedPhoto, consumeRateLimit, provider } = {}) {
  return async (req, res) => {
    if (req.method !== "POST") { res.setHeader?.("Allow", "POST"); return send(res, 405, { error: "method_not_allowed" }); }
    if (!enabled || !providerName || ![verifyToken, getConsent, getOwnedPhoto, consumeRateLimit, provider].every((fn) => typeof fn === "function")) {
      return send(res, 503, { error: "ai_disabled" });
    }
    const authorization = req.headers?.authorization;
    const token = typeof authorization === "string" ? authorization.match(/^Bearer ([^\s]+)$/)?.[1] : null;
    if (!token) return send(res, 401, { error: "authentication_required" });
    let uid;
    try { uid = (await verifyToken(token))?.uid; } catch { return send(res, 401, { error: "authentication_required" }); }
    if (typeof uid !== "string" || !ID.test(uid)) return send(res, 401, { error: "authentication_required" });
    let body;
    try {
      const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      if (!raw || new TextEncoder().encode(raw).length > 1024) throw new Error();
      body = JSON.parse(raw);
      if (!body || Object.keys(body).length !== 2 || !ID.test(body.catchId) || !ID.test(body.photoId)
        || typeof body.catchId !== "string" || typeof body.photoId !== "string") throw new Error();
    } catch { return send(res, 400, { error: "invalid_request" }); }
    try {
      if (!hasAiConsent(await getConsent(uid), "species", providerName)) return send(res, 403, { error: "consent_required" });
      if (!await consumeRateLimit(uid)) return send(res, 429, { error: "rate_limited" });
      const photo = await getOwnedPhoto(uid, body.catchId, body.photoId);
      if (photo?.ownerId !== uid || photo.catchId !== body.catchId || photo.photoId !== body.photoId || photo.deleted) {
        return send(res, 404, { error: "photo_not_found" });
      }
      if (!(photo.bytes instanceof Uint8Array) || !photo.bytes.length || photo.bytes.length > 2 * 1024 * 1024
        || !["image/jpeg", "image/png", "image/webp"].includes(photo.mimeType) || photo.metadataStripped !== true) {
        return send(res, 422, { error: "unsupported_photo" });
      }
      // Revocation during download must prevent dispatch to the external model.
      if (!hasAiConsent(await getConsent(uid), "species", providerName)) return send(res, 403, { error: "consent_required" });
      const output = await provider({ bytes: photo.bytes, mimeType: photo.mimeType });
      return send(res, 200, validateSpeciesSuggestion(output));
    } catch { return send(res, 503, { error: "ai_unavailable" }); }
  };
}
