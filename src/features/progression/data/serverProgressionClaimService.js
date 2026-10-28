import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { firebaseAuth } from "../../auth/data/firebaseAuth.js";
import { catchRepository } from "../../catches/data/catchRepository.js";
import { serverProgressionClaimRepository } from "./serverProgressionClaimRepository.js";

const MAX_CLAIMS_PER_PASS = 5;

export function createServerProgressionClaimService({
  claimRepository = serverProgressionClaimRepository,
  catches = catchRepository,
  auth = firebaseAuth,
  fetchImpl = (...args) => fetch(...args),
  online = () => typeof navigator === "undefined" || navigator.onLine !== false,
  now = () => Date.now(),
} = {}) {
  const runningOwners = new Set();

  async function process(ownerId) {
    if (!ownerId || !online() || auth.currentUserId() !== ownerId || runningOwners.has(ownerId)) return { attempted: 0 };
    runningOwners.add(ownerId);
    const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
    let attempted = 0;
    try {
      const pending = (await claimRepository.list(ownerId))
        .filter((claim) => claim.status === "pending" && (!claim.nextAttemptAt || Date.parse(claim.nextAttemptAt) <= now()))
        .slice(0, MAX_CLAIMS_PER_PASS);
      for (const claim of pending) {
        if (!online() || auth.currentUserId() !== ownerId) break;
        const record = await (catches.getMetadata ?? catches.get).call(catches, claim.catchId, scope).catch(() => null);
        if (!record || record.sync?.status !== "metadata-synced") continue;
        const photos = record.photos ?? [];
        if (photos.length > 0 && !photos.some((photo) => photo.cloud?.state === "synced")) continue;
        attempted += 1;
        try {
          const token = await auth.currentIdToken();
          if (!token || auth.currentUserId() !== ownerId) break;
          const controller = typeof AbortController === "function" ? new AbortController() : null;
          const timer = controller ? setTimeout(() => controller.abort(), 12_000) : null;
          let response;
          try {
            response = await fetchImpl("/api/progression/claim-catch", {
              method: "POST",
              credentials: "same-origin",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ catchId: claim.catchId }),
              ...(controller ? { signal: controller.signal } : {}),
            });
          } finally { if (timer) clearTimeout(timer); }
          if (response.ok) {
            const result = await response.json();
            if (result.mode !== "shadow" || result.catchId !== claim.catchId) throw new Error("invalid_server_response");
            await claimRepository.markSucceeded(claim.catchId, ownerId, result, new Date(now()).toISOString());
            if (typeof window !== "undefined") window.dispatchEvent(new Event("chytnu:progression-changed"));
          } else if (response.status >= 400 && response.status < 500 && response.status !== 404 && response.status !== 429) {
            await claimRepository.markBlocked(claim.catchId, ownerId, `http_${response.status}`, new Date(now()).toISOString());
          } else {
            await claimRepository.markRetry(claim.catchId, ownerId, `http_${response.status}`, now());
          }
        } catch (error) {
          const errorCode = error?.name === "AbortError" ? "request_timeout"
            : typeof error?.code === "string" ? error.code : "network_error";
          await claimRepository.markRetry(claim.catchId, ownerId, errorCode, now()).catch(() => {});
        }
      }
      return { attempted };
    } finally {
      runningOwners.delete(ownerId);
    }
  }

  return { process };
}

export const serverProgressionClaimService = createServerProgressionClaimService();
