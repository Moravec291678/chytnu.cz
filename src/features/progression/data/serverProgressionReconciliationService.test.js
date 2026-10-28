import test from "node:test";
import assert from "node:assert/strict";
import { createServerProgressionReconciliationService } from "./serverProgressionReconciliationService.js";

function fixture({ currentOwner = "owner-a", claims = [{ catchId: "catch-new", status: "pending" }] } = {}) {
  const requests = [];
  const service = createServerProgressionReconciliationService({
    auth: { currentUserId: () => currentOwner, async currentIdToken() { return "firebase-token"; } },
    ledger: { async list() { return []; } },
    claimRepository: { async list(ownerId) { assert.equal(ownerId, "owner-a"); return claims; } },
    fetchImpl: async (url, request) => {
      requests.push({ url, request });
      return { ok: true, async json() { return { mode: "shadow", legacyBaselineXp: 80, serverEventXp: 20, serverTotalXp: 100 }; } };
    },
  });
  return { service, requests };
}

test("reconciliation sends owner-authenticated totals and excludes local XP for server-claimed catches", async () => {
  const { service, requests } = fixture({ claims: [
    { catchId: "catch-new", status: "pending" }, { catchId: "catch-old", status: "succeeded" },
  ] });
  const events = [
    { type: "catch.created", sourceEntityType: "catch", sourceEntityId: "catch-new", xp: 10 },
    { type: "catch.limited", sourceEntityType: "catch", sourceEntityId: "catch-old", xp: 5 },
    { type: "species.first", sourceEntityType: "catch", sourceEntityId: "catch-new", xp: 3 },
  ];
  const result = await service.reconcile({ ownerId: "owner-a" }, events);
  assert.equal(result.serverTotalXp, 100);
  assert.equal(requests[0].url, "/api/progression/reconcile");
  assert.deepEqual(JSON.parse(requests[0].request.body), { localProgressionXp: 18, pendingCatchXp: 15 });
  assert.equal(requests[0].request.headers.Authorization, "Bearer firebase-token");
});

test("reconciliation does not send another owner's local progression", async () => {
  const { service, requests } = fixture({ currentOwner: "owner-b" });
  assert.equal(await service.reconcile({ ownerId: "owner-a" }, []), null);
  assert.equal(requests.length, 0);
});
