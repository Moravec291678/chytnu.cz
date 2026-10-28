import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { getActiveGuestScopeKey, openLocalDatabase } from "../../catches/data/catchRepository.js";
import { serverProgressionClaimRepository } from "./serverProgressionClaimRepository.js";

const DB_NAME = "chytnu-local";
const ownerScope = { ownerId: "owner-a", scopeKey: "account:owner-a" };

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

test("claim queue is durable, owner-scoped, and can be re-enqueued after an edit", async () => {
  await resetDatabase();
  await serverProgressionClaimRepository.enqueue("catch-1", ownerScope, { now: "2026-10-28T10:00:00.000Z" });
  let claims = await serverProgressionClaimRepository.list("owner-a");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "pending");
  assert.equal(claims[0].catchId, "catch-1");
  assert.deepEqual(await serverProgressionClaimRepository.list("owner-b"), []);

  await serverProgressionClaimRepository.markRetry("catch-1", "owner-a", "network_error", Date.parse("2026-10-28T10:00:00.000Z"));
  claims = await serverProgressionClaimRepository.list("owner-a");
  assert.equal(claims[0].attemptCount, 1);
  assert.equal(Date.parse(claims[0].nextAttemptAt), Date.parse("2026-10-28T10:00:02.000Z"));

  await serverProgressionClaimRepository.markSucceeded("catch-1", "owner-a", {
    verificationLevel: "standard", eligible: true, xpAwarded: 15, totalCatchXp: 15, eventIds: ["catch-photo-catch-1"],
  }, "2026-10-28T10:01:00.000Z");
  assert.equal((await serverProgressionClaimRepository.list("owner-a"))[0].status, "succeeded");

  await serverProgressionClaimRepository.enqueue("catch-1", ownerScope, { now: "2026-10-28T10:02:00.000Z" });
  claims = await serverProgressionClaimRepository.list("owner-a");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].status, "pending");
  assert.equal(claims[0].serverResult, null);
});

test("missing-claim recovery is idempotent and guest scopes cannot enqueue server claims", async () => {
  await resetDatabase();
  const now = "2026-10-28T10:00:00.000Z";
  await serverProgressionClaimRepository.enqueue("catch-1", ownerScope, { now });
  await serverProgressionClaimRepository.enqueue("catch-1", ownerScope, { onlyIfMissing: true, now });
  assert.equal((await serverProgressionClaimRepository.list("owner-a")).length, 1);
  const guestScope = await getActiveGuestScopeKey();
  await assert.rejects(serverProgressionClaimRepository.enqueue("guest-catch", { scopeKey: guestScope, ownerId: null }), /vyžaduje přihlášený účet/);
  const db = await openLocalDatabase();
  db.close();
});
