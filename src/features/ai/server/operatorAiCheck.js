import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { createCloudflareSpeciesProvider, createCloudflareTextProvider, CLOUDFLARE_ZERO_COST_MODEL } from "./cloudflareProvider.js";
import { createZeroCostQuota, blockZeroCostQuota } from "./zeroCostQuota.js";
import { getAccountDeletionAdminContext } from "../../../server/cloudinaryApi.js";

// Temporary operator capability; fixed nonpersonal fixtures only. No caller prompt,
// image URL or user records are accepted. Remove its deployment secret after checks.
export function createOperatorAiCheck({ env = globalThis.process?.env ?? {}, admin = () => getAccountDeletionAdminContext(env),
  textProvider, speciesProvider } = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const send = (status, body) => res.status(status).json(body);
    if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
    const expected = env.AI_OPERATOR_TEST_SECRET;
    const token = String(req.headers?.authorization ?? "").replace(/^Bearer /, "");
    if (typeof expected !== "string" || expected.length < 64 || Buffer.byteLength(token) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return send(401, { error: "operator_auth_required" });
    if (env.AI_ZERO_COST_CONFIRMED !== "true" || env.AI_PROVIDER !== "cloudflare"
      || env.AI_CLOUDFLARE_MODEL !== CLOUDFLARE_ZERO_COST_MODEL) return send(503, { error: "free_configuration_required" });
    let providerStatus = null, providerCode = null;
    try {
      const { db, Timestamp } = await admin();
      const quota = createZeroCostQuota({ db, Timestamp });
      const configuration = { accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_API_TOKEN,
        model: env.AI_CLOUDFLARE_MODEL, onQuotaExhausted: () => blockZeroCostQuota({ db, Timestamp }),
        fetchImpl: async (url, options) => {
          const response = await fetch(url, options);
          providerStatus = response.status;
          if (!response.ok) {
            const body = await response.clone().json().catch(() => null);
            const code = body?.errors?.[0]?.code ?? body?.error?.code;
            if (Number.isSafeInteger(code)) providerCode = code;
          }
          return response;
        } };
      if (!await quota("operator-text-check")) return send(429, { error: "quota_exhausted" });
      const story = await (textProvider ?? createCloudflareTextProvider(configuration))({
        notes: "Ráno jsem byl u vody. Žádnou rybu jsem nechytil. Potom jsem se vrátil domů.", action: "title" });
      if (!await quota("operator-vision-check")) return send(429, { error: "quota_exhausted", text: "PASS" });
      const bytes = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgUbL4DwACCgFmeGgpMwAAAABJRU5ErkJggg==", "base64"));
      const species = await (speciesProvider ?? createCloudflareSpeciesProvider(configuration))({ bytes, mimeType: "image/png" });
      if (species.status !== "unknown") return send(422, { error: "no_fish_abstention_failed", text: "PASS", vision: "PASS" });
      return send(200, { status: "PASS", model: CLOUDFLARE_ZERO_COST_MODEL, text: "PASS", vision: "PASS",
        noFish: "unknown", title: story.text, limitation: "Fixed nonpersonal smoke test; not fish accuracy or physical-device acceptance." });
    } catch { return send(503, { error: "operator_provider_check_failed", providerStatus, providerCode }); }
  };
}
