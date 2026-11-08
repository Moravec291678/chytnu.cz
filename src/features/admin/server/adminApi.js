import { adminError, validateAdminRequest } from "./adminValidation.js";
import { validAdminUid } from "../adminPolicy.js";
import { createAdminService } from "./adminStore.js";
import { configuredOwnerUid } from "./adminAccess.js";
import { getAccountDeletionAdminContext, verifyFirebaseIdToken } from "../../../server/cloudinaryApi.js";

export function createAdminHandler({ verifyToken, service } = {}) {
  if (typeof verifyToken !== "function" || typeof service?.execute !== "function") throw new TypeError("Admin handler dependencies are required.");
  return async (req, res) => {
    res.setHeader?.("Cache-Control", "no-store");
    res.setHeader?.("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
    const bearer = req.headers?.authorization?.match(/^Bearer ([^\s]+)$/);
    if (!bearer) return res.status(401).json({ error: "authentication_required" });
    let identity;
    try { identity = await verifyToken(bearer[1]); } catch { return res.status(401).json({ error: "authentication_required" }); }
    if (!validAdminUid(identity?.uid)) return res.status(401).json({ error: "authentication_required" });
    try {
      let body = req.body;
      if (typeof body === "string") {
        if (body.length > 65_536) throw adminError("request_too_large", 413);
        try { body = JSON.parse(body); } catch { throw adminError("invalid_request"); }
      }
      if (JSON.stringify(body ?? null).length > 65_536) throw adminError("request_too_large", 413);
      const request = validateAdminRequest(body);
      return res.status(200).json(await service.execute(request, identity));
    } catch (error) {
      const safe = error?.status >= 400 && error.status <= 503 && /^[a-z_]{1,60}$/.test(error.code ?? "");
      return res.status(safe ? error.status : 503).json({ error: safe ? error.code : "admin_unavailable" });
    }
  };
}

export async function createProductionAdminHandler({ env = globalThis.process?.env ?? {}, now = () => Date.now() } = {}) {
  const context = () => getAccountDeletionAdminContext(env);
  return createAdminHandler({ verifyToken: async token => verifyFirebaseIdToken((await context()).auth, token),
    service: { execute: async (request, identity) => {
      const { db, auth } = await context();
      return createAdminService({ db, auth, ownerUid: configuredOwnerUid(env), env, now }).execute(request, identity);
    } } });
}
