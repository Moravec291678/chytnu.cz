import assert from "node:assert/strict";
import test from "node:test";
import { createAiApplicationApi, createFirebaseAiApplicationDependencies } from "./aiApplicationApi.js";

const capabilities = { species: true, stories: true, diary: true, recommendations: true };
const consent = () => ({ ownerId: "owner", provider: "cloudflare", version: 1, capabilities: { ...capabilities },
  grantedAt: "2026-11-04T10:00:00Z", revokedAt: null, revision: 1 });
const suggestion = { status: "suggestion", speciesKey: "commonCarp", confidence: 0.8, alternatives: [], fishCount: 1 };
const photo = () => ({ ownerId: "owner", catchId: "catch-1", photoId: "photo-1", bytes: new Uint8Array([1, 2]),
  mimeType: "image/jpeg", metadataStripped: true, sourceSha256: "a".repeat(64) });
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
  const state = { consent: consent(), records: [record()], photo: photo(), calls: { photo: 0, quota: 0, species: 0, text: 0, analysis: 0, save: 0 }, cache: new Map() };
  const deps = { enabled: true, modelId: "test-model", features: { ...capabilities }, verifyToken: async () => ({ uid: "owner" }),
    getConsent: async () => structuredClone(state.consent), setConsent: async () => state.consent,
    getOwnedPhoto: async () => { state.calls.photo++; return structuredClone(state.photo); },
    getOwnedCatch: async () => structuredClone(state.records[0]), listOwnedCatches: async () => ({ records: structuredClone(state.records), truncated: false }),
    consumeRateLimit: async () => { state.calls.quota++; return true; }, getCachedResult: async (uid, key) => state.cache.get(`${uid}:${key}`),
    saveResult: async (uid, key, entry, options) => { state.calls.save++; state.cache.set(`${uid}:${key}`, { ...structuredClone(entry), consentRevision: options.consentRevision }); return true; },
    speciesProvider: async () => { state.calls.species++; return structuredClone(suggestion); },
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
    { ...consent(), provider: "other" }, { ...consent(), capabilities: { ...capabilities, species: false } }]) {
    const { state, handler } = fixture();
    state.consent = change;
    assert.equal((await call(handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 403);
    assert.deepEqual(state.calls, { photo: 0, quota: 0, species: 0, text: 0, analysis: 0, save: 0 });
  }
  const { state, handler } = fixture({ features: { ...capabilities, species: false } });
  assert.equal((await call(handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 503);
  assert.equal(state.calls.photo, 0);
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

test("species owner/photo/hash and metadata-stripping gates reject cross-user or unsupported sources", async () => {
  for (const changes of [{ ownerId: "another" }, { catchId: "another-catch" }, { photoId: "another-photo" }, { deleted: true },
    { metadataStripped: false }, { sourceSha256: undefined }, { bytes: new Uint8Array(2 * 1024 * 1024 + 1) }]) {
    const { state, handler } = fixture();
    Object.assign(state.photo, changes);
    assert.ok([404, 422].includes((await call(handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code));
    assert.equal(state.calls.species, 0);
    assert.equal(state.calls.quota, 0);
  }
});

test("species cache reuses only matching owner/model/photo identity and does not consume inference quota again", async () => {
  const { state, handler } = fixture();
  const body = { action: "species", catchId: "catch-1", photoId: "photo-1" };
  assert.deepEqual((await call(handler, body)).body, { ...suggestion, sourceSha256: "a".repeat(64) });
  assert.deepEqual((await call(handler, body)).body, { ...suggestion, sourceSha256: "a".repeat(64) });
  assert.equal(state.calls.species, 1);
  assert.equal(state.calls.quota, 1);
  assert.equal(state.calls.save, 1);
  const cache = [...state.cache.values()][0];
  assert.equal(cache.ownerId, "owner");
  assert.equal(cache.photoSha256, "a".repeat(64));
  assert.equal("bytes" in cache, false);
  state.photo.sourceSha256 = "b".repeat(64);
  const replaced = await call(handler, body);
  assert.equal(replaced.code, 200);
  assert.equal(replaced.body.sourceSha256, "b".repeat(64));
  assert.equal(state.calls.species, 2);
  cache.ownerId = "someone-else";
  state.photo.sourceSha256 = "a".repeat(64);
  assert.equal((await call(handler, body)).code, 200);
  assert.equal(state.calls.species, 3);
});

test("quota denial and invalid provider output never mutate a catch or save a fabricated result", async () => {
  const denied = fixture({ consumeRateLimit: async () => ({ allowed: false, code: "user_daily_limit", retryAt: "2026-11-05T00:00:00Z" }) });
  assert.equal((await call(denied.handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 429);
  assert.equal(denied.state.calls.species, 0);
  assert.equal(denied.state.calls.save, 0);
  const invalid = fixture({ speciesProvider: async () => ({ ...suggestion, speciesKey: "invented", lengthCm: 100 }) });
  assert.equal((await call(invalid.handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 503);
  assert.equal(invalid.state.calls.save, 0);
  assert.deepEqual(invalid.state.records[0], record());
});

test("revocation during photo download prevents dispatch; revocation during inference suppresses result persistence", async () => {
  const before = fixture();
  const handler = createAiApplicationApi({ ...before.deps, getOwnedPhoto: async () => {
    before.state.consent = { ...consent(), revokedAt: "2026-11-04T11:00:00Z", revision: 2 };
    return photo();
  } });
  assert.equal((await call(handler, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 403);
  assert.equal(before.state.calls.species, 0);
  const during = fixture();
  const late = createAiApplicationApi({ ...during.deps, speciesProvider: async () => {
    during.state.consent = { ...consent(), revokedAt: "2026-11-04T11:00:00Z", revision: 2 };
    return suggestion;
  } });
  assert.equal((await call(late, { action: "species", catchId: "catch-1", photoId: "photo-1" })).code, 403);
  assert.equal(during.state.calls.save, 0);
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

test("diary and recommendations calculate factual counts locally, send only bounded aggregates and link owner evidence", async () => {
  const { state, deps } = fixture();
  state.records.push({ ...record(), id: "other-owner", ownerId: "other", notes: "foreign-private-note" }, { ...record(), id: "deleted-catch", deleted: true });
  const handler = createAiApplicationApi({ ...deps, analysisProvider: async ({ task, summary }) => {
    state.calls.analysis++;
    assert.ok(["diary", "recommendations"].includes(task));
    assert.equal(summary.count, 1);
    assert.equal(summary.meanLengthCm, 60);
    const payload = JSON.stringify(summary);
    for (const privateValue of ["latitude", "longitude", record().notes, "catch-1", "foreign-private-note", "evidenceIds"]) assert.equal(payload.includes(privateValue), false);
    return { text: "Málo záznamů; podmínky budoucího úlovku nelze zaručit.", evidenceKeys: ["count", "meanLengthCm"] };
  } });
  for (const action of ["diary", "recommendations"]) {
    const result = await call(handler, { action });
    assert.equal(result.code, 200);
    assert.equal(result.body.summary.count, 1);
    assert.deepEqual(result.body.evidenceIds, ["catch-1"]);
    assert.equal(result.body.isHypothesis, true);
    assert.ok(result.body.limitations.some((line) => line.includes("Malý vzorek")));
    assert.equal((await call(handler, { action })).code, 200);
  }
  assert.equal(state.calls.analysis, 2);
  assert.equal(state.calls.quota, 2);
});

test("invalid or empty analysis evidence, excessive data and changed sources fail safely", async () => {
  const invalid = fixture({ analysisProvider: async () => ({ text: "Fabricated explanation", evidenceKeys: ["GPS"] }) });
  assert.equal((await call(invalid.handler, { action: "diary" })).code, 503);
  assert.equal(invalid.state.calls.save, 0);
  const empty = fixture({ listOwnedCatches: async () => ({ records: [] }) });
  assert.equal((await call(empty.handler, { action: "diary" })).code, 422);
  const large = fixture({ listOwnedCatches: async () => ({ records: Array.from({ length: 501 }, record) }) });
  assert.equal((await call(large.handler, { action: "diary" })).code, 503);
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

test("Firebase result writes are fenced by consent revision, source notes/photo and account deletion; no catch is mutated", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ admin: async () => ({ db }), now: () => 1_000_000 });
  db.data.set("users/owner/aiPreferences/consent", consent());
  db.data.set("users/owner/catches/catch-1", { ...record(), photoRefs: { "photo-1": true } });
  db.data.set("users/owner/catches/catch-1/photos/photo-1", { id: "photo-1", cloud: { state: "synced", sha256: "a".repeat(64) } });
  const entry = { ownerId: "owner", type: "species", catchId: "catch-1", photoId: "photo-1", photoSha256: "a".repeat(64), result: suggestion };
  assert.equal(await deps.saveResult("owner", "b".repeat(64), entry, { capability: "species", consentRevision: 1 }), true);
  assert.equal(db.data.get("users/owner/catches/catch-1").notes, record().notes);
  assert.equal(await deps.saveResult("owner", "c".repeat(64), { ...entry, ownerId: "other" }, { capability: "species", consentRevision: 1 }), false);
  assert.equal(await deps.saveResult("owner", "c".repeat(64), { ...entry, photoSha256: "c".repeat(64) }, { capability: "species", consentRevision: 1 }), false);
  const story = { ownerId: "owner", type: "story", catchId: "catch-1", result: { text: "draft" } };
  assert.equal(await deps.saveResult("owner", "c".repeat(64), story, { capability: "stories", consentRevision: 1, expectedNotes: "stale" }), false);
  db.data.set("users/owner/aiPreferences/consent", { ...consent(), revision: 2, revokedAt: "2026-11-04T11:00:00Z" });
  assert.equal(await deps.saveResult("owner", "c".repeat(64), entry, { capability: "species", consentRevision: 1 }), false);
  db.data.set("accountDeletions/owner", { status: "deleting" });
  assert.equal(await deps.saveResult("owner", "c".repeat(64), entry, { capability: "species", consentRevision: 1 }), false);
  await assert.rejects(deps.getConsent("owner"), (error) => error.aiCode === "account_unavailable");
  await assert.rejects(deps.setConsent("owner", { revoke: true }), (error) => error.aiCode === "account_unavailable");
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

test("automatic species is separately opt-in and status reads never consume quota", async () => {
  const setup = fixture();
  setup.state.photo.captureMode = "quick"; setup.state.photo.createdAt = "2026-11-04T11:00:00Z";
  assert.equal((await call(setup.handler, { action: "species.auto", catchId: "catch-1", photoId: "photo-1" })).code, 403);
  assert.equal(setup.state.calls.quota, 0);
  setup.state.consent.automaticSpecies = true; setup.state.consent.automaticSpeciesFrom = "2026-11-04T10:00:00Z";
  const pending = await call(setup.handler, { action: "species.status", catchId: "catch-1", photoId: "photo-1" });
  assert.equal(pending.body.status, "pending"); assert.equal(setup.state.calls.quota, 0);
  const result = await call(setup.handler, { action: "species.auto", catchId: "catch-1", photoId: "photo-1" });
  assert.equal(result.code, 200); assert.equal(result.body.speciesKey, "commonCarp");
  await call(setup.handler, { action: "species.status", catchId: "catch-1", photoId: "photo-1" });
  assert.equal(setup.state.calls.species, 1); assert.equal(setup.state.calls.quota, 1);
  setup.state.photo.confirmed = true;
  assert.equal((await call(setup.handler, { action: "species.status", catchId: "catch-1", photoId: "photo-1" })).body.status, "confirmed");
  assert.equal((await call(setup.handler, { action: "species.auto", catchId: "catch-1", photoId: "photo-1" })).body.status, "ineligible");
});

test("structured application/provider errors expose safe codes and known reset only", async () => {
  const { AiServiceError } = await import("./aiServiceError.js");
  for (const code of ["user_daily_limit", "app_daily_limit", "text_daily_limit", "provider_quota", "quota_unavailable"]) {
    const setup = fixture({ consumeRateLimit: async () => ({ allowed: false, code, retryAt: "2026-11-09T00:00:00Z" }), diagnostic() {} });
    const result = await call(setup.handler, { action: "species", catchId: "catch-1", photoId: "photo-1" });
    assert.equal(result.body.error, code); assert.equal(result.body.retryAt, "2026-11-09T00:00:00Z");
    assert.equal(setup.state.calls.species, 0);
  }
  const setup = fixture({ speciesProvider: async () => { throw new AiServiceError("provider_auth", { providerCode: 10000 }); }, diagnostic() {} });
  const result = await call(setup.handler, { action: "species", catchId: "catch-1", photoId: "photo-1" });
  assert.deepEqual(result.body, { error: "provider_auth" });
});

test("Home rechecks owned deterministic fingerprint, caches prose and rejects stale or thin evidence before inference", async () => {
  const report = { version: "personal-fishing-v1", fingerprint: "c".repeat(32), providerSummary: { candidates: [{ candidate: 1 }] },
    strongest: { evidenceIds: ["catch-1"] } };
  let generations = 0;
  const setup = fixture({ getOwnedContext: async () => ({ catches: [record()] }), buildHomeAnalysis: () => report,
    homeProvider: async () => { generations++; return { text: "Porovnej podobné výpravy se stejnou metodou." }; } });
  assert.equal((await call(setup.handler, { action: "home", fingerprint: "b".repeat(32) })).code, 409);
  const first = await call(setup.handler, { action: "home", fingerprint: report.fingerprint });
  assert.equal(first.code, 200); assert.equal(first.body.modelVersion, report.version);
  const cached = await call(setup.handler, { action: "home", fingerprint: report.fingerprint });
  assert.equal(cached.code, 200); assert.equal(generations, 1); assert.equal(setup.state.calls.quota, 1);
  report.providerSummary.candidates = [];
  assert.equal((await call(setup.handler, { action: "home", fingerprint: report.fingerprint })).code, 422);
  assert.equal(generations, 1);
});

test("automatic consent starts only at explicit opt-in, retains its original epoch, and revokes with photo permission", async () => {
  const db = fakeFirestore();
  const deps = createFirebaseAiApplicationDependencies({ env: {}, admin: async () => ({ db }), now: () => Date.parse("2026-11-08T10:00:00Z") });
  const enabled = await deps.setConsent("owner", { version: 1, capabilities, expectedRevision: 0, automaticSpecies: true });
  assert.equal(enabled.automaticSpecies, true); assert.equal(enabled.automaticSpeciesFrom, "2026-11-08T10:00:00.000Z");
  const updated = await deps.setConsent("owner", { version: 1, capabilities, expectedRevision: 1 });
  assert.equal(updated.automaticSpeciesFrom, enabled.automaticSpeciesFrom);
  const revoked = await deps.setConsent("owner", { version: 1, expectedRevision: 2, capabilities: { ...capabilities, species: false } });
  assert.equal(revoked.automaticSpecies, false); assert.equal(revoked.automaticSpeciesFrom, null);
});

test("unavailable image preflight consumes no inference reservation", async () => {
  const setup = fixture({ getOwnedPhotoIdentity: async () => ({ ...photo(), bytes: undefined }),
    getOwnedPhoto: async () => { throw new Error("private signed URL failure"); }, diagnostic() {} });
  const result = await call(setup.handler, { action: "species", catchId: "catch-1", photoId: "photo-1" });
  assert.equal(result.code, 503); assert.equal(result.body.error, "photo_unavailable");
  assert.equal(setup.state.calls.quota, 0); assert.equal(setup.state.calls.species, 0);
});
