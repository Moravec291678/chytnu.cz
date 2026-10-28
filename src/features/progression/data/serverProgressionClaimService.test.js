import test from "node:test";
import assert from "node:assert/strict";
import { createServerProgressionClaimService } from "./serverProgressionClaimService.js";

function makeFixture({ online = true, record = { id: "catch-1", sync: { status: "metadata-synced" }, photos: [] }, response = null } = {}) {
  const state = { online, currentOwner: "owner-a", calls: [], retries: [], completed: [], blocked: [] };
  const claimRepository = {
    async list(ownerId) { return [{ id: "claim-1", ownerId, catchId: "catch-1", status: "pending", nextAttemptAt: null }]; },
    async markSucceeded(catchId, ownerId, result) { state.completed.push({ catchId, ownerId, result }); },
    async markRetry(catchId, ownerId, code) { state.retries.push({ catchId, ownerId, code }); },
    async markBlocked(catchId, ownerId, code) { state.blocked.push({ catchId, ownerId, code }); },
  };
  const catches = { async getMetadata() { return record; } };
  const auth = { currentUserId: () => state.currentOwner, async currentIdToken() { return "firebase-token"; } };
  const fetchImpl = async (url, options) => {
    state.calls.push({ url, options });
    return response ?? { ok: true, status: 200, async json() { return { mode: "shadow", catchId: "catch-1", verificationLevel: "standard", eligible: true, xpAwarded: 15, totalCatchXp: 15, eventIds: ["e1"] }; } };
  };
  const service = createServerProgressionClaimService({
    claimRepository, catches, auth, fetchImpl, online: () => state.online, now: () => Date.parse("2026-10-28T12:00:00.000Z"),
  });
  return { service, state };
}

test("offline or locally pending Catch stays pending without network or UI-blocking errors", async () => {
  const offline = makeFixture({ online: false });
  assert.deepEqual(await offline.service.process("owner-a"), { attempted: 0 });
  assert.equal(offline.state.calls.length, 0);
  const local = makeFixture({ record: { id: "catch-1", sync: { status: "local" }, photos: [] } });
  assert.deepEqual(await local.service.process("owner-a"), { attempted: 0 });
  assert.equal(local.state.calls.length, 0);
});

test("online processor sends only Catch ID with Firebase auth and marks success", async () => {
  const { service, state } = makeFixture();
  assert.deepEqual(await service.process("owner-a"), { attempted: 1 });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].url, "/api/progression/claim-catch");
  assert.equal(state.calls[0].options.headers.Authorization, "Bearer firebase-token");
  assert.deepEqual(JSON.parse(state.calls[0].options.body), { catchId: "catch-1" });
  assert.equal(state.completed[0].result.xpAwarded, 15);
});

test("photo Catch waits until the existing photo transport reports an uploaded copy", async () => {
  const pending = makeFixture({ record: { id: "catch-1", sync: { status: "metadata-synced" }, photos: [{ id: "p1", cloud: { state: "uploading" } }] } });
  assert.deepEqual(await pending.service.process("owner-a"), { attempted: 0 });
  assert.equal(pending.state.calls.length, 0);
  const ready = makeFixture({ record: { id: "catch-1", sync: { status: "metadata-synced" }, photos: [{ id: "p1", cloud: { state: "synced" } }] } });
  assert.deepEqual(await ready.service.process("owner-a"), { attempted: 1 });
});

test("server errors stay queued with retryable status; invalid requests become blocked", async () => {
  const retry = makeFixture({ response: { ok: false, status: 503 } });
  await retry.service.process("owner-a");
  assert.equal(retry.state.retries[0].code, "http_503");
  const blocked = makeFixture({ response: { ok: false, status: 400 } });
  await blocked.service.process("owner-a");
  assert.equal(blocked.state.blocked[0].code, "http_400");
});

test("account switch during processing prevents submitting the previous owner's claim", async () => {
  const changedOwner = makeFixture();
  changedOwner.state.currentOwner = "owner-b";
  assert.deepEqual(await changedOwner.service.process("owner-a"), { attempted: 0 });
  assert.equal(changedOwner.state.calls.length, 0);
});
