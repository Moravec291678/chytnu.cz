import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, openLocalDatabase, APP_META_STORE_NAME } from "../catches/data/catchRepository.js";
import { automaticSpeciesEligible, createAutomaticSpeciesCoordinator, readAutomaticSpecies, suggestedSpeciesForDisplay } from "./automaticSpecies.js";
import { AiClientError } from "./aiClient.js";
const scope = { ownerId: "auto-owner", scopeKey: "account:auto-owner" };
const digest = "a".repeat(64);
const consent = () => ({ version: 1, provider: "cloudflare", grantedAt: "2026-11-08T08:00:00Z", automaticSpecies: true,
  automaticSpeciesFrom: "2026-11-08T08:00:00Z", revision: 1, capabilities: { species: true } });
const prediction = { status: "suggestion", speciesKey: "commonCarp", confidence: 0.9, fishCount: 1, alternatives: [], sourceSha256: digest };
async function seed() {
  await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase("chytnu-local"); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
  return catchRepository.put({ id: "capture", captureMode: "quick", createdAt: "2026-11-08T09:00:00Z", caughtAt: "2026-11-08T09:00:00Z",
    speciesKey: "", species: "Druh zatím neurčen", quickCatch: { provenance: {} }, notes: "", photos: [{ id: "photo", contentSha256: digest,
      type: "image/jpeg", cloud: { state: "synced", sha256: digest } }], sync: { revision: 1 } }, scope);
}
function coordinator(client, extra = {}) {
  return createAutomaticSpeciesCoordinator({ scope, repository: catchRepository, client, online: () => true,
    now: () => Date.parse("2026-11-08T10:00:00Z"), setTimer: () => 1, clearTimer() {}, ...extra });
}
test("automatic recognition waits offline/READY, runs without a button, persists result and never confirms a species", async () => {
  const original = await seed(); let connected = false, calls = 0;
  const client = { getConsent: async () => { assert.ok(connected); return consent(); }, automaticSpecies: async ({ statusOnly }) => {
    calls++; return statusOnly ? { status: "pending" } : prediction;
  } };
  const worker = coordinator(client, { online: () => connected });
  await worker.run(); assert.equal(calls, 0);
  assert.equal((await readAutomaticSpecies([original], scope))[0].aiRecognition.status, "consent_required");
  connected = true;
  await catchRepository.put({ ...original, photos: [{ ...original.photos[0], cloud: { state: "localOnly" } }] }, scope);
  await worker.run(); assert.equal(calls, 0);
  connected = false; await worker.run();
  assert.equal((await readAutomaticSpecies([original], scope))[0].aiRecognition.status, "waiting_internet");
  connected = true;
  const waiting = await catchRepository.get(original.id, scope);
  await catchRepository.put({ ...waiting, photos: original.photos }, scope);
  await worker.run(); assert.equal(calls, 2);
  const stored = await catchRepository.get(original.id, scope);
  assert.equal(stored.speciesKey, "");
  const displayed = (await readAutomaticSpecies([stored], scope))[0];
  assert.equal(suggestedSpeciesForDisplay(displayed).key, "commonCarp");
  assert.equal(suggestedSpeciesForDisplay({ ...displayed, speciesKey: "northernPike" }), null);
  worker.stop();
  const reopened = coordinator(client); await reopened.run(); reopened.stop(); assert.equal(calls, 2);
  // A fresh second local view obtains the completed server cache without generation.
  const db = await openLocalDatabase();
  await new Promise(resolve => { const tx = db.transaction(APP_META_STORE_NAME, "readwrite"); tx.objectStore(APP_META_STORE_NAME).clear(); tx.oncomplete = resolve; }); db.close();
  const second = coordinator({ getConsent: async () => consent(), automaticSpecies: async ({ statusOnly }) => { assert.equal(statusOnly, true); return prediction; } });
  await second.run(); second.stop();
  assert.equal((await readAutomaticSpecies([stored], scope))[0].aiSpeciesSuggestion.speciesKey, "commonCarp");
});
test("consent is opt-in, historical catches are ineligible, revocation hides suggestions and cannot dispatch", async () => {
  const record = await seed();
  for (const value of [null, { ...consent(), automaticSpecies: false }, { ...consent(), revokedAt: "2026-11-08T09:01:00Z" }]) {
    assert.equal(Boolean(automaticSpeciesEligible(record, value, scope.ownerId)), false);
    const worker = coordinator({ getConsent: async () => value, automaticSpecies: () => assert.fail("no dispatch") });
    await worker.run(); worker.stop();
  }
  assert.equal(Boolean(automaticSpeciesEligible({ ...record, createdAt: "2026-11-07T09:00:00Z" }, consent(), scope.ownerId)), false);
  const granted = coordinator({ getConsent: async () => consent(), automaticSpecies: async () => prediction });
  await granted.run(); granted.stop();
  const revoked = coordinator({ getConsent: async () => ({ ...consent(), revision: 2, revokedAt: "2026-11-08T10:00:00Z" }), automaticSpecies: () => assert.fail("no dispatch") });
  await revoked.run(); revoked.stop();
  assert.equal((await readAutomaticSpecies([record], scope))[0].aiSpeciesSuggestion, undefined);
});
test("hard daily quota defers durably until the exact reset, with no repeated inference", async () => {
  const record = await seed(); let calls = 0, time = Date.parse("2026-11-08T10:00:00Z"); const reset = "2026-11-09T00:00:00Z";
  const worker = coordinator({ getConsent: async () => consent(), automaticSpecies: async ({ statusOnly }) => {
    if (statusOnly) return { status: "pending" };
    if (++calls === 1) throw new AiClientError("user_daily_limit", { retryAt: reset }); return prediction;
  } }, { now: () => time });
  await worker.run(); await worker.run(); assert.equal(calls, 1);
  const deferred = (await readAutomaticSpecies([record], scope))[0].aiRecognition;
  assert.equal(deferred.status, "deferred"); assert.equal(deferred.retryAt, reset);
  time = Date.parse(reset); await worker.run(); worker.stop(); assert.equal(calls, 2);
});
test("late recognition cannot replace manual corrections or resurrect a deleted catch", async () => {
  for (const operation of ["manual", "delete"]) {
    const record = await seed();
    const worker = coordinator({ getConsent: async () => consent(), automaticSpecies: async ({ statusOnly }) => {
      if (statusOnly) return { status: "pending" };
      if (operation === "delete") await catchRepository.delete(record.id, scope);
      else await catchRepository.put({ ...record, speciesKey: "northernPike", sync: { revision: 2 } }, scope);
      return prediction;
    } });
    await worker.run(); worker.stop();
    const current = await catchRepository.get(record.id, scope);
    if (operation === "delete") assert.equal(current, undefined);
    else { assert.equal(current.speciesKey, "northernPike"); assert.equal(suggestedSpeciesForDisplay((await readAutomaticSpecies([current], scope))[0]), null); }
  }
});

test("one hard capacity refusal defers the remaining ready captures without an API retry storm", async () => {
  const first = await seed();
  await catchRepository.put({ ...first, id: "second" }, scope);
  await catchRepository.put({ ...first, id: "third" }, scope);
  let calls = 0;
  const worker = coordinator({ getConsent: async () => consent(), automaticSpecies: async ({ statusOnly }) => {
    calls++; if (statusOnly) return { status: "pending" };
    throw new AiClientError("app_daily_limit", { retryAt: "2026-11-09T00:00:00Z" });
  } });
  await worker.run(); worker.stop();
  assert.equal(calls, 2);
  const displayed = await readAutomaticSpecies(await catchRepository.listMetadata(scope), scope);
  assert.equal(displayed.filter(row => row.aiRecognition?.status === "deferred").length, 3);
});
