import { createCloudinaryPhotoDeletionService } from "./cloudinaryPhotoDeletion.js";
import { createAccountDeletionService } from "./accountDeletion.js";
import { cloudinaryPublicId, getAccountDeletionAdminContext, verifyFirebaseIdToken } from "./cloudinaryApi.js";

const RECENT_AUTH_SECONDS = 5 * 60;

export function createAccountDeletionHandler({ verifyToken, service, now = () => Date.now() } = {}) {
  if (typeof verifyToken !== "function" || !service?.request || !service?.advanceOwner) {
    throw new TypeError("Account deletion handler dependencies are required.");
  }
  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "no-store");
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    if (req.body && (typeof req.body !== "object" || Object.keys(req.body).length > 0)) {
      return res.status(400).json({ error: "invalid_request" });
    }
    const bearer = req.headers?.authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) return res.status(401).json({ error: "authentication_required" });
    let identity;
    try { identity = await verifyToken(bearer[1]); }
    catch { return res.status(401).json({ error: "authentication_required" }); }
    const uid = identity?.uid;
    if (typeof uid !== "string" || !uid || uid.length > 128 || uid.includes("/")) {
      return res.status(403).json({ error: "invalid_identity" });
    }
    const authTime = identity.auth_time;
    if (!Number.isSafeInteger(authTime) || authTime > Math.floor(now() / 1000) + 60
      || Math.floor(now() / 1000) - authTime > RECENT_AUTH_SECONDS) {
      return res.status(403).json({ error: "recent_auth_required" });
    }
    try {
      await service.request(uid);
      const result = await service.advanceOwner(uid);
      return res.status(202).json({ status: result?.status ?? "requested" });
    } catch {
      return res.status(503).json({ error: "account_deletion_unavailable" });
    }
  };
}

export async function createProductionAccountDeletionHandler({ env = globalThis.process?.env ?? {}, now = () => Date.now() } = {}) {
  const { auth, db, Timestamp } = await getAccountDeletionAdminContext(env);
  const photoDeletion = createCloudinaryPhotoDeletionService({ db, Timestamp,
    getCloudinary: async () => { throw new Error("Cloudinary access is reserved for the cleanup worker."); },
    derivePublicId: cloudinaryPublicId, now });
  const service = createAccountDeletionService({ db, auth, photoDeletion, now });
  return createAccountDeletionHandler({ verifyToken: (token) => verifyFirebaseIdToken(auth, token), service, now });
}
