import assert from "node:assert/strict";
import test from "node:test";
import { createAiApplicationApi, createFirebaseAiApplicationDependencies } from "./aiApplicationApi.js";
import { AI_FEATURES } from "../aiPolicy.js";

const capabilities = { species: true, stories: true, diary: true, recommendations: true };
const consent = () => ({ ownerId: "owner", provider: "cloudflare", version: 1, capabilities: { ...capabilities },
  grantedAt: "2026-11-04T10:00:00Z", revokedAt: null, revision: 1 });
const record = () => ({ id: "catch-1", ownerId: "owner", notes: "Ráno jsem chytil kapra.", speciesKey: "commonCarp",
  caughtAt: "2026-11-04T10:00:00Z", lengthCm: 60, serverRevision: 3, coordinates: { latitude: 50, longitude: 14 } });
const request = (body, changes = {}) => ({ method: "POST", headers: { authorization: "Bearer test-token" }, body, ...changes });
async function call(handler, body, changes) {
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
  await handler(request(body, changes), res);
  assert.equal(res.headers["Cache-Control"], "no-store");
  return res;
}
function fixture(overrides = {}) {
  const state = { consent: consent(), records: [record()], calls: { quota: 0, text: 0, analysis: 0, save: 0 }, cache: new Map() };
  const deps = { enabled: true, modelId: "test-model", features: { ...capabilities }, verifyToken: async () => ({ uid: "owner" }),
    getConsent: async () => structuredClone(state.consent), setConsent: async () => state.consent,
    getOwnedCatch: async () => structuredClone(state.records[0]), listOwnedCatches: async () => ({ records: structuredClone(state.records), truncated: false }),
    consumeRateLimit: async () => { state.calls.quota++; return true; }, getCachedResult: async (uid, key) => state.cache.get(`${uid}:${key}`),
    saveResult: async (uid, key, entry, options) => { state.calls.save++; state.cache.set(`${uid}:${key}`, { ...structuredClone(entry), consentRevision: options.consentRevision }); return true; },
    textProvider: async () => { state.calls.text++; return { text: "Ranní setkání s kaprem" }; },
    analysisProvider: async () => { state.calls.analysis++; return { text: "Zatím jde o malý vzorek zapsaných úlovků.", evidenceKeys: ["count", "species"] }; },
  };
  return { state, deps, handler: createAiApplicationApi({ ...deps, ...overrides }) };
}

test("application route is source-disabled by default, POST-only and rejects untrusted body/identity", async () => {
  assert.equal((await call(createAiApplicationApi(), { action: "consent.get" })).code, 503);
  const { handler } = fixture();
  assert.equal((await call(handler, { action: "consent.get" }, { method: "GET" })).code, 405);
  assert.equal((await call(handler, { action: "consent.get" }, { headers: {} })).code, 401);
  for (const body of [{ action: "species", catchId: "../other", photoId: "photo-1" },
    { action: "species", catchId: "catch-1", photoId: "photo-1", ownerId: "another-user" },
    { action: "story", catchId: "catch-1", task: "publish" }, { action: "diary", records: [record()] },
    { action: "recommendations", gps: { latitude: 50 } }, "x".repeat(2049), { action: "unknown" }]) {
    assert.equal((await call(handler, body)).code, 400);
  }
  const invalidToken = fixture({ verifyToken: async () => { throw new Error("revoked"); } });
  assert.equal((await call(invalidToken.handler, { action: "consent.get" })).code, 401);
  const invalidUid = fixture({ verifyToken: async () => ({ uid: "../other" }) });
  assert.equal((await call(invalidUid.handler, { action: "consent.get" })).code, 401);
});

test("explicit per-capability consent and feature flags guard personal payloads before retrieval", async () => {
  for (const change of [null, { ...consent(), ownerId: "another" }, { ...consent(), revokedAt: "2026-11-04T11:00:00Z" },
    { ...consent(), provider: "other" }, { ...consent(), capabilities: { ...capabilities, stories: false } }]) {
    const { state, handler } = fixture();
    state.consent = change;
    assert.equal((await call(handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 403);
    assert.deepEqual(state.calls, { quota: 0, text: 0, analysis: 0, save: 0 });
  }
  const { state, handler } = fixture({ features: { ...capabilities, stories: false } });
  assert.equal((await call(handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 503);
  assert.equal(state.calls.text, 0);
});

test("removed species and standalone diary actions are rejected even with injected feature overrides", async () => {
  const { state, handler } = fixture({ features: { ...AI_FEATURES, species: true, diary: true },
    speciesProvider: () => assert.fail("Removed species provider must not run"),
    getOwnedPhoto: () => assert.fail("Removed image retrieval must not run") });
  for (const action of ["species", "species.auto", "species.status", "diary", "home"]) {
    assert.equal((await call(handler, { action })).body.error, "invalid_request");
  }
  assert.deepEqual(state.calls, { quota: 0, text: 0, analysis: 0, save: 0 });
});

test("consent API exposes only public fields and requires an explicit current-version revision for updates", async () => {
  const calls = [];
  const { handler } = fixture({ setConsent: async (uid, values) => { calls.push({ uid, values }); return consent(); } });
  const current = await call(handler, { action: "consent.get" });
  assert.equal(current.code, 200);
  assert.equal(current.body.consent.provider, "cloudflare");
  assert.equal("ownerId" in current.body.consent, false);
  const update = { action: "consent.update", version: 1, expectedRevision: 1, capabilities };
  assert.equal((await call(handler, update)).code, 200);
  assert.deepEqual(calls[0], { uid: "owner", values: { version: 1, expectedRevision: 1, capabilities } });
  assert.equal((await call(handler, { ...update, version: 2 })).code, 400);
  const { expectedRevision: ignored, ...missingRevision } = update;
  assert.equal(ignored, 1);
  assert.equal((await call(handler, missingRevision)).code, 400);
  assert.equal((await call(handler, { action: "consent.revoke" })).code, 200);
  assert.deepEqual(calls[1], { uid: "owner", values: { revoke: true } });
});

test("quota denial and invalid provider output never mutate a catch or save a fabricated result", async () => {
  const denied = fixture({ consumeRateLimit: async () => ({ allowed: false, code: "user_daily_limit", retryAt: "2026-11-05T00:00:00Z" }) });
  assert.equal((await call(denied.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 429);
  assert.equal(denied.state.calls.text, 0);
  assert.equal(denied.state.calls.save, 0);
  const invalid = fixture({ textProvider: async () => ({ text: "" }) });
  assert.equal((await call(invalid.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 503);
  assert.equal(invalid.state.calls.save, 0);
  assert.deepEqual(invalid.state.records[0], record());
});

test("revocation during note retrieval or inference prevents saved result delivery", async () => {
  for (const phase of ["source", "provider"]) {
    const setup = fixture();
    const revoke = () => { setup.state.consent = { ...consent(), revokedAt: "2026-11-04T11:00:00Z", revision: 2 }; };
    const handler = createAiApplicationApi({ ...setup.deps,
      getOwnedCatch: async () => { if (phase === "source") revoke(); return record(); },
      textProvider: async () => { if (phase === "provider") revoke(); return { text: "Draft" }; },
    });
    assert.equal((await call(handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 403);
    assert.equal(setup.state.calls.save, 0);
  }
});

test("story assistance reads owned server notes only and returns an approval-only draft without modifying the original", async () => {
  const { state, handler } = fixture();
  const body = { action: "story", catchId: "catch-1", task: "improve" };
  const response = await call(handler, body);
  assert.equal(response.code, 200);
  assert.equal(response.body.status, "draft");
  assert.equal(response.body.originalNotes, record().notes);
  assert.equal(response.body.sourceNotes, record().notes);
  assert.equal(response.body.catchId, "catch-1");
  assert.equal(response.body.baseRevision, 3);
  assert.equal(response.body.requiresFactReview, true);
  assert.deepEqual(state.records[0], record());
  assert.equal((await call(handler, body)).code, 200);
  assert.equal(state.calls.text, 1);
  state.records[0].ownerId = "other";
  assert.equal((await call(handler, body)).code, 404);
  state.records[0] = { ...record(), notes: "" };
  assert.equal((await call(handler, body)).code, 422);
});

test("journal recommendations calculate factual counts locally, send only bounded aggregates and link owner evidence", async () => {
  const { state, deps } = fixture();
  state.records.push({ ...record(), id: "other-owner", ownerId: "other", notes: "foreign-private-note" }, { ...record(), id: "deleted-catch", deleted: true });
  const handler = createAiApplicationApi({ ...deps, analysisProvider: async ({ task, summary }) => {
    state.calls.analysis++;
    assert.equal(task, "recommendations");
    assert.equal(summary.count, 1);
    assert.equal(summary.meanLengthCm, 60);
    const payload = JSON.stringify(summary);
    for (const privateValue of ["latitude", "longitude", record().notes, "catch-1", "foreign-private-note", "evidenceIds"]) assert.equal(payload.includes(privateValue), false);
    return { text: "Málo záznamů; podmínky budoucího úlovku nelze zaručit.", evidenceKeys: ["count", "meanLengthCm"] };
  } });
  for (const action of ["recommendations"]) {
    const result = await call(handler, { action });
    assert.equal(result.code, 200);
    assert.equal(result.body.summary.count, 1);
    assert.deepEqual(result.body.evidenceIds, ["catch-1"]);
    assert.equal(result.body.isHypothesis, true);
    assert.ok(result.body.limitations.some((line) => line.includes("Malý vzorek")));
    assert.equal((await call(handler, { action })).code, 200);
  }
  assert.equal(state.calls.analysis, 1);
  assert.equal(state.calls.quota, 1);
});

test("invalid or empty analysis evidence, excessive data and changed sources fail safely", async () => {
  const invalid = fixture({ analysisProvider: async () => ({ text: "Fabricated explanation", evidenceKeys: ["GPS"] }) });
  assert.equal((await call(invalid.handler, { action: "recommendations" })).code, 503);
  assert.equal(invalid.state.calls.save, 0);
  const empty = fixture({ listOwnedCatches: async () => ({ records: [] }) });
  assert.equal((await call(empty.handler, { action: "recommendations" })).code, 422);
  const large = fixture({ listOwnedCatches: async () => ({ records: Array.from({ length: 501 }, record) }) });
  assert.equal((await call(large.handler, { action: "recommendations" })).code, 503);
  const changed = fixture({ saveResult: async () => false });
  assert.equal((await call(changed.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 409);
});

function fakeFirestore() {
  const data = new Map();
  const snapshot = (path) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)), ref: { path }, id: path.split("/").at(-1) });
  let pending = Promise.resolve();
  const db = { data, doc: (path) => ({ path, get: async () => snapshot(path) }),
    runTransaction(operation) {
      const work = pending.then(async () => {
        const writes = [];
        const value = await operation({ get: async (ref) => {
          if (writes.length) throw new Error("Reads must precede writes");
          return snapshot(ref.path);
        }, set: (ref, value) => writes.push([ref.path, structuredClone(value)]) });
        for (const [path, value] of writes) data.set(path, value);
        return value;
      });
      pending = work.catch(() => {});
      return work;
    },
    collection(path) {
      let filter = () => true, maximum = Infinity;
      const query = { where(field, operator, value) { filter = (record) => operator === "<" ? record[field] < value : record[field] === value; return query; },
        orderBy() { return query; }, limit(value) { maximum = value; return query; }, async get() {
          const docs = [...data.keys()].filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/") && filter(data.get(key))).slice(0, maximum).map(snapshot);
          return { docs, empty: !docs.length, size: docs.length };
        } };
      return query;
    },
    batch() { const paths = []; return { delete: ({ path }) => paths.push(path), commit: async () => { paths.forEach((path) => data.delete(path)); } }; },
  };
  return db;
}

test("Firebase consent CAS prevents stale regrant after revocation and cleans only the older owner's cache", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ admin: async () => ({ db }), now: () => Date.parse("2026-11-04T10:00:00Z") });
  const granted = await deps.setConsent("owner", { version: 1, expectedRevision: 0, capabilities });
  assert.equal(granted.revision, 1);
  db.data.set("users/owner/aiResults/old", { ownerId: "owner", consentRevision: 1 });
  db.data.set("users/other/aiResults/untouched", { ownerId: "other", consentRevision: 1 });
  const revoked = await deps.setConsent("owner", { revoke: true });
  assert.equal(revoked.revision, 2);
  assert.ok(Object.values(revoked.capabilities).every((value) => !value));
  assert.equal(db.data.has("users/owner/aiResults/old"), false);
  assert.equal(db.data.has("users/other/aiResults/untouched"), true);
  await assert.rejects(deps.setConsent("owner", { version: 1, expectedRevision: 1, capabilities }), (error) => error.aiCode === "consent_conflict");
  assert.equal((await deps.getConsent("owner")).revokedAt, revoked.revokedAt);
  const next = await deps.setConsent("owner", { version: 1, expectedRevision: 2, capabilities });
  assert.equal(next.revision, 3);
});

test("Firebase result writes fence consent, owner, source notes and account deletion without catch mutation", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ admin: async () => ({ db }), now: () => 1000000 });
  db.data.set("users/owner/aiPreferences/consent", consent());
  db.data.set("users/owner/catches/catch-1", record());
  const entry = { ownerId: "owner", type: "story", catchId: "catch-1", result: { text: "draft" } };
  const options = { capability: "stories", consentRevision: 1, expectedNotes: record().notes };
  assert.equal(await deps.saveResult("owner", "b".repeat(64), entry, options), true);
  assert.equal(await deps.saveResult("owner", "c".repeat(64), { ...entry, ownerId: "other" }, options), false);
  assert.equal(await deps.saveResult("owner", "c".repeat(64), entry, { ...options, expectedNotes: "stale" }), false);
  assert.deepEqual(db.data.get("users/owner/catches/catch-1"), record());
  db.data.set("users/owner/aiPreferences/consent", { ...consent(), revision: 2, revokedAt: "2026-11-04T11:00:00Z" });
  assert.equal(await deps.saveResult("owner", "c".repeat(64), entry, options), false);
  db.data.set("accountDeletions/owner", { status: "deleting" });
  assert.equal(await deps.saveResult("owner", "c".repeat(64), entry, options), false);
  await assert.rejects(deps.getConsent("owner"), error => error.aiCode === "account_unavailable");
  await assert.rejects(deps.setConsent("owner", { revoke: true }), error => error.aiCode === "account_unavailable");
});

test("partial capability revocation invalidates older caches and cleanup failure never restores authorization", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ admin: async () => ({ db }), now: () => 1_000_000 });
  db.data.set("users/owner/aiPreferences/consent", consent());
  db.data.set("users/owner/aiResults/old", { ownerId: "owner", consentRevision: 1 });
  db.data.set("users/owner/aiResults/new", { ownerId: "owner", consentRevision: 2 });
  const changed = await deps.setConsent("owner", { version: 1, expectedRevision: 1, capabilities: { ...capabilities, species: false } });
  assert.equal(changed.revokedAt, null);
  assert.equal(changed.capabilities.species, false);
  assert.equal(changed.capabilities.stories, true);
  assert.equal(db.data.has("users/owner/aiResults/old"), false);
  assert.equal(db.data.has("users/owner/aiResults/new"), true);
  db.collection = () => { throw new Error("Cleanup storage unavailable"); };
  const revoked = await deps.setConsent("owner", { revoke: true });
  assert.equal(revoked.cleanupPending, true);
  assert.ok(revoked.revokedAt);
  assert.ok(Object.values((await deps.getConsent("owner")).capabilities).every((value) => !value));
});

test("structured application/provider errors expose safe codes and known reset only", async () => {
  const { AiServiceError } = await import("./aiServiceError.js");
  for (const code of ["user_daily_limit", "app_daily_limit", "text_daily_limit", "provider_quota", "quota_unavailable"]) {
    const setup = fixture({ consumeRateLimit: async () => ({ allowed: false, code, retryAt: "2026-11-09T00:00:00Z" }), diagnostic() {} });
    const result = await call(setup.handler, { action: "story", catchId: "catch-1", task: "improve" });
    assert.equal(result.body.error, code); assert.equal(result.body.retryAt, "2026-11-09T00:00:00Z");
    assert.equal(setup.state.calls.text, 0);
  }
  const setup = fixture({ textProvider: async () => { throw new AiServiceError("provider_auth", { providerCode: 10000 }); }, diagnostic() {} });
  const result = await call(setup.handler, { action: "story", catchId: "catch-1", task: "improve" });
  assert.deepEqual(result.body, { error: "provider_auth" });
});

test("legacy Home AI action is rejected before consent, quota or inference", async () => {
  let generations = 0;
  const setup = fixture({ homeProvider: async () => { generations++; return { text: "must not run" }; }, diagnostic() {} });
  const result = await call(setup.handler, { action: "home", fingerprint: "b".repeat(32) });
  assert.equal(result.code, 400);
  assert.equal(result.body.error, "invalid_request");
  assert.equal(generations, 0);
  assert.equal(setup.state.calls.quota, 0);
});

test("consent persistence ignores disabled AI capabilities and revokes the supported capabilities", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ env: {}, admin: async () => ({ db }), now: () => Date.parse("2026-11-08T10:00:00Z") });
  const enabled = await deps.setConsent("owner", { version: 1, capabilities, expectedRevision: 0, automaticSpecies: true });
  assert.equal(enabled.capabilities.species, false); assert.equal(enabled.capabilities.diary, false);
  assert.equal(enabled.capabilities.stories, true); assert.equal(enabled.capabilities.recommendations, true);
  assert.equal(enabled.automaticSpecies, false); assert.equal(enabled.automaticSpeciesFrom, null);
  const updated = await deps.setConsent("owner", { version: 1, capabilities, expectedRevision: 1 });
  assert.equal(updated.automaticSpecies, false);
  const revoked = await deps.setConsent("owner", { version: 1, expectedRevision: 2,
    capabilities: { ...capabilities, stories: false, recommendations: false } });
  assert.equal(revoked.automaticSpecies, false); assert.equal(revoked.automaticSpeciesFrom, null);
  assert.equal(revoked.capabilities.stories, false); assert.equal(revoked.capabilities.recommendations, false);
});

test("runtime denial or revocation is checked before quota/provider and cached result delivery", async () => {
  const denied = fixture({ authorizeRuntime: async () => false, diagnostic() {} });
  assert.equal((await call(denied.handler, { action: "story", catchId: "catch-1", task: "improve" })).body.error, "ai_disabled");
  assert.equal(denied.state.calls.text, 0); assert.equal(denied.state.calls.quota, 0);
  let allowed = true;
  const cached = fixture({ authorizeRuntime: async () => allowed, diagnostic() {} });
  assert.equal((await call(cached.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 200);
  allowed = false;
  assert.equal((await call(cached.handler, { action: "story", catchId: "catch-1", task: "improve" })).body.error, "ai_disabled");
  assert.equal(cached.state.calls.text, 1);
  let checks = 0;
  const changed = fixture({ authorizeRuntime: async () => ++checks < 2, diagnostic() {} });
  assert.equal((await call(changed.handler, { action: "story", catchId: "catch-1", task: "improve" })).body.error, "ai_disabled");
  assert.equal(changed.state.calls.quota, 0); assert.equal(changed.state.calls.text, 0);
});

test("provider diagnostics count actual attempts only, omit cache/quota checks and cannot break fishing APIs", async () => {
  const events = [];
  const setup = fixture({ recordInference: event => { events.push(event); }, diagnostic() {} });
  assert.equal((await call(setup.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 200);
  assert.equal((await call(setup.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 200);
  assert.deepEqual(events, [{ capability: "stories", status: "success" }]);
  const offlineMonitoring = fixture({ recordInference: () => { throw new Error("monitor unavailable"); } });
  assert.equal((await call(offlineMonitoring.handler, { action: "story", catchId: "catch-1", task: "improve" })).code, 200);
  const rejected = fixture({ consumeRateLimit: async () => false, recordInference: event => events.push(event), diagnostic() {} });
  await call(rejected.handler, { action: "story", catchId: "catch-1", task: "improve" });
  assert.equal(events.length, 1);
});

test("transactional story result commit respects current runtime state and account suspension", async () => {
  const db = fakeFirestore(), uid = "owner";
  const deps = createFirebaseAiApplicationDependencies({ env: {}, admin: async () => ({ db }) });
  db.data.set(`users/${uid}/aiPreferences/consent`, consent());
  db.data.set(`users/${uid}/catches/catch-1`, record());
  const entry = { ownerId: uid, type: "story", catchId: "catch-1", result: { text: "draft" } };
  const options = { capability: "stories", consentRevision: 1, expectedNotes: record().notes };
  assert.equal(await deps.saveResult(uid, "e".repeat(64), entry, options), true);
  db.data.set("adminConfig/runtime", { features: { stories: { audience: "disabled", userIds: [] } } });
  assert.equal(await deps.saveResult(uid, "d".repeat(64), entry, options), false);
  db.data.delete("adminConfig/runtime"); db.data.set(`accountSuspensions/${uid}`, { suspendedAt: "2026-11-08T10:00:00Z" });
  assert.equal(await deps.saveResult(uid, "c".repeat(64), entry, options), false);
});

test("only a successful saved response settles its reservation; cache hits reserve nothing", async () => {
  let settled = 0;
  const { handler, state } = fixture({ consumeRateLimit: async () => ({ allowed: true, reservationId: "server-ticket" }),
    textProvider: async ({ onUsage }) => { onUsage({ prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100 }); return { text: "Návrh příběhu" }; },
    settleRateLimit: async (uid, ticket, usage) => { assert.equal(uid,"owner"); assert.equal(ticket,"server-ticket"); assert.equal(usage.total_tokens,2100); settled++; } });
  assert.equal((await call(handler,{action:"story",catchId:"catch-1",task:"improve"})).code,200);
  assert.equal((await call(handler,{action:"story",catchId:"catch-1",task:"improve"})).code,200);
  assert.equal(settled,1); assert.equal(state.calls.save,1);
  const failed = fixture({ consumeRateLimit: async () => ({ allowed:true, reservationId:"ticket" }), textProvider: async ({onUsage}) => { onUsage({prompt_tokens:1,completion_tokens:1,total_tokens:2}); throw new Error("timeout"); }, settleRateLimit: async () => assert.fail("Failed request must keep reservation") });
  assert.equal((await call(failed.handler,{action:"story",catchId:"catch-1",task:"improve"})).code,503);
});
