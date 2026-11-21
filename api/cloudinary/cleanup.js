import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { runProductionCloudinaryPhotoCleanup } from "../../src/server/cloudinaryApi.js";
import { restoreProductionExpiredSuspensions } from "../../src/features/admin/server/suspensionMaintenance.js";

function validCronAuthorization(header, secret) {
  if (typeof secret !== "string" || secret.length < 16 || typeof header !== "string") return false;
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createCleanupHandler({ runCleanup = runProductionCloudinaryPhotoCleanup,
  runMaintenance = null, getSecret = () => globalThis.process?.env?.CRON_SECRET,
  logRun = (event) => console.info(JSON.stringify(event)) } = {}) {
  function record(status, summary = {}) {
    const counts = Object.fromEntries(["deleted", "failed", "deferred"].filter((key) =>
      Number.isSafeInteger(summary[key]) && summary[key] >= 0).map((key) => [key, summary[key]]));
    try { logRun({ event: "cloud_cleanup", status, ...counts }); } catch { /* Logging must not affect cleanup. */ }
  }
  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "no-store");
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
      if (runMaintenance) result.suspensions = await runMaintenance();
      record(result.failed ? "partial_failure" : "completed", result);
      return res.status(result.failed ? 207 : 200).json(result);
    } catch {
      record("unavailable");
      return res.status(503).json({ error: "photo_cleanup_unavailable" });
    }
  };
}

export default createCleanupHandler({ runMaintenance: restoreProductionExpiredSuspensions });

export { validCronAuthorization };
