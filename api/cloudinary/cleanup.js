import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { runProductionCloudinaryPhotoCleanup } from "../../src/server/cloudinaryApi.js";

function validCronAuthorization(header, secret) {
  if (typeof secret !== "string" || secret.length < 16 || typeof header !== "string") return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createCleanupHandler({ runCleanup = runProductionCloudinaryPhotoCleanup,
  getSecret = () => globalThis.process?.env?.CRON_SECRET } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader?.("Allow", "GET");
      return res.status(405).json({ error: "method_not_allowed" });
    }
    const secret = getSecret();
    if (!validCronAuthorization(req.headers?.authorization, secret)) {
      return res.status(secret ? 401 : 503).json({ error: secret ? "unauthorized" : "cleanup_not_configured" });
    }
    try {
      const result = await runCleanup();
      res.setHeader?.("Cache-Control", "no-store");
      return res.status(result.failed ? 207 : 200).json(result);
    } catch {
      return res.status(503).json({ error: "photo_cleanup_unavailable" });
    }
  };
}

export default createCleanupHandler();

export { validCronAuthorization };
