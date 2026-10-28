import test from "node:test";
import assert from "node:assert/strict";
import { createAdminClaimer, createAdminProgressionReconciler, createServerProgressionApi } from "./progressionApi.js";
import { createEnabledTestEnvironment } from "./cloudinaryApi.js";

function response() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function apiFixture(overrides = {}) {
  const calls = [];
  const api = await createServerProgressionApi({
    env: { ...createEnabledTestEnvironment(), SERVER_PROGRESSION_SHADOW: "true" },
    verifyToken: async (token) => token === "valid" ? { uid: "owner-1" } : Promise.reject(new Error("invalid token")),
    claimCatch: async (...args) => { calls.push(args); return { verificationLevel: "limited", xpAwarded: 4, eventIds: ["catch-limited-c1"] }; },
    reconcileTotals: async (...args) => { calls.push(args); return { legacyBaselineXp: args[1].localProgressionXp, serverEventXp: 12, serverTotalXp: args[1].localProgressionXp + 12 }; },
    now: () => 1000,
    ...overrides,
  });
  return { api, calls };
}

test("authenticated claim accepts Catch ID only and server returns calculated shadow reward", async () => {
  const { api, calls } = await apiFixture();
  const res = response();
  await api.claim({ method: "POST", headers: { authorization: "Bearer valid" }, body: { catchId: "catch-1" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mode, "shadow");
  assert.deepEqual(calls, [["owner-1", "catch-1", 1000]]);
});

test("authenticated reconciliation accepts totals only and is idempotent across device requests", async () => {
  const { api, calls } = await apiFixture();
  const first = response();
  await api.reconcile({ method: "POST", headers: { authorization: "Bearer valid" }, body: { localProgressionXp: 100, pendingCatchXp: 0 } }, first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.serverTotalXp, 112);
  assert.deepEqual(calls, [["owner-1", { localProgressionXp: 100, pendingCatchXp: 0 }, 1000]]);

  const secondDevice = response();
  await api.reconcile({ method: "POST", headers: { authorization: "Bearer valid" }, body: { localProgressionXp: 80, pendingCatchXp: 0 } }, secondDevice);
  assert.equal(secondDevice.statusCode, 200);
  assert.equal(secondDevice.body.serverTotalXp, 92);
  assert.ok(calls.every(([ownerId]) => ownerId === "owner-1"));
});

test("reconciliation rejects unauthenticated or client-authored XP fields", async () => {
  const { api, calls } = await apiFixture();
  const forged = response();
  await api.reconcile({ method: "POST", headers: { authorization: "Bearer valid" }, body: { localProgressionXp: 10, pendingCatchXp: 0, xp: 1000 } }, forged);
  assert.equal(forged.statusCode, 400);
  const unauthenticated = response();
  await api.reconcile({ method: "POST", body: { localProgressionXp: 10, pendingCatchXp: 0 } }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(calls.length, 0);
});

test("client supplied XP or other fields are rejected, never forwarded as authority", async () => {
  const { api, calls } = await apiFixture();
  const res = response();
  await api.claim({ method: "POST", headers: { authorization: "Bearer valid" }, body: { catchId: "catch-1", xp: 1000 } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(calls, []);
});

test("claim requires owner authentication and production shadow gate", async () => {
  const { api } = await apiFixture();
  const unauthenticated = response();
  await api.claim({ method: "POST", body: { catchId: "catch-1" } }, unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
  const disabled = await apiFixture({ env: { ...createEnabledTestEnvironment(), SERVER_PROGRESSION_SHADOW: "false" } });
  const gated = response();
  await disabled.api.claim({ method: "POST", headers: { authorization: "Bearer valid" }, body: { catchId: "catch-1" } }, gated);
  assert.equal(gated.statusCode, 503);
});

test("method, malformed catch IDs, and rate limits are bounded", async () => {
  const methodApi = await apiFixture();
  const method = response();
  await methodApi.api.claim({ method: "GET" }, method);
  assert.equal(method.statusCode, 405);
  const malformed = response();
  await methodApi.api.claim({ method: "POST", headers: { authorization: "Bearer valid" }, body: { catchId: "../other-owner" } }, malformed);
  assert.equal(malformed.statusCode, 400);
  const limited = await apiFixture({ consumeRateLimit: async () => false });
  const rate = response();
  await limited.api.claim({ method: "POST", headers: { authorization: "Bearer valid" }, body: { catchId: "catch-1" } }, rate);
  assert.equal(rate.statusCode, 429);
});

function makeFakeFirestore() {
  const documents = new Map();
  const makeRef = (path) => ({
    path,
    id: path.split("/").at(-1),
    collection(name) { return { path: `${path}/${name}`, isCollection: true, doc(id) { return makeRef(`${path}/${name}/${id}`); } }; },
  });
  const db = {
    documents,
    doc: makeRef,
    collectionGroup(name) {
      return { where(field, operator, value) { return { collectionGroup: name, field, operator, value }; } };
    },
    async runTransaction(operation) {
      const writes = [];
      const transaction = {
        async get(ref) {
          if (ref.isCollection) {
            const docs = [...documents.entries()].filter(([path]) => path.startsWith(`${ref.path}/`) && path.slice(ref.path.length + 1).indexOf("/") === -1)
              .map(([path, data]) => ({ ref: makeRef(path), exists: true, data: () => structuredClone(data) }));
            return { docs };
          }
          if (ref.collectionGroup) {
            const docs = [...documents.entries()].filter(([path, data]) => (
              path.includes(`/${ref.collectionGroup}/`) && ref.operator === "=="
              && ref.field.split(".").reduce((current, part) => current?.[part], data) === ref.value
            )).map(([path, data]) => ({ ref: makeRef(path), exists: true, data: () => structuredClone(data) }));
            return { docs };
          }
          const data = documents.get(ref.path);
          return { exists: data !== undefined, id: ref.id, data: () => structuredClone(data) };
        },
        create(ref, data) { writes.push(["create", ref.path, structuredClone(data)]); },
        set(ref, data) { writes.push(["set", ref.path, structuredClone(data)]); },
      };
      const result = await operation(transaction);
      for (const [operationName, path, data] of writes) {
        if (operationName === "create" && documents.has(path)) throw new Error("already-exists");
        documents.set(path, data);
      }
      return result;
    },
  };
  return db;
}

test("Admin transaction writes stable owner-scoped events once and supports later evidence upgrades", async () => {
  const ownerId = "owner-1";
  const catchId = "catch-1";
  const photoHash = "a".repeat(64);
  const caughtAt = "2026-10-28T10:00:00.000Z";
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const db = makeFakeFirestore();
  const catchPath = `users/${ownerId}/catches/${catchId}`;
  const photoPath = `${catchPath}/photos/photo-1`;
  db.documents.set(catchPath, {
    id: catchId, ownerId, deleted: false, caughtAt, photos: [{ id: "photo-1", cloud: {
      state: "synced", provider: "cloudinary", objectKey: `${photoPath}/original`, sha256: photoHash,
    } }], verification: {}, conditions: null, coordinates: null, gpsSource: "default", waterId: null, tripId: null,
  });
  db.documents.set(photoPath, { id: "photo-1", deleted: false, cloud: { sha256: photoHash } });
  const claim = createAdminClaimer(db, () => "SERVER_TIMESTAMP");

  const limited = await claim(ownerId, catchId, now);
  assert.equal(limited.verificationLevel, "limited");
  assert.equal(limited.xpAwarded, 4);
  assert.equal(limited.eventIds[0], `catch-limited-${catchId}`);
  const replay = await claim(ownerId, catchId, now);
  assert.equal(replay.xpAwarded, 0);
  assert.deepEqual(replay.eventIds, []);

  db.documents.set(catchPath, {
    ...db.documents.get(catchPath),
    verification: { photoCaptureMetadata: { capturedAt: caughtAt, coordinates: null } },
  });
  const upgraded = await claim(ownerId, catchId, now);
  assert.equal(upgraded.verificationLevel, "standard");
  assert.equal(upgraded.xpAwarded, 11);
  assert.equal(upgraded.totalCatchXp, 15);
  const finalReplay = await claim(ownerId, catchId, now);
  assert.equal(finalReplay.xpAwarded, 0);

  const events = [...db.documents.entries()].filter(([path]) => path.startsWith(`users/${ownerId}/serverProgressionEvents/`));
  assert.equal(events.reduce((total, [, event]) => total + event.xp, 0), 15);
  assert.ok(events.every(([, event]) => event.createdAt === "SERVER_TIMESTAMP" && event.ownerId === ownerId));
  assert.equal(db.documents.get(`users/${ownerId}/serverProgressionPhotoClaims/${photoHash}`).catchId, catchId);
});

test("admin reconciliation keeps a monotonic legacy baseline and shares confirmed event XP between devices", async () => {
  const db = makeFakeFirestore();
  const ownerId = "owner-multi-device";
  db.documents.set(`users/${ownerId}/serverProgressionEvents/event-1`, { ownerId, xp: 20 });
  db.documents.set(`users/${ownerId}/serverProgressionEvents/event-invalid`, { ownerId, xp: -500 });
  const reconcile = createAdminProgressionReconciler(db, () => "SERVER_TIMESTAMP");
  const deviceA = await reconcile(ownerId, { localProgressionXp: 100, pendingCatchXp: 0 });
  assert.equal(deviceA.legacyBaselineXp, 80);
  assert.equal(deviceA.serverEventXp, 20);
  assert.equal(deviceA.serverTotalXp, 100);
  const deviceB = await reconcile(ownerId, { localProgressionXp: 70, pendingCatchXp: 0 });
  assert.equal(deviceB.serverTotalXp, 100);
  const replay = await reconcile(ownerId, { localProgressionXp: 100, pendingCatchXp: 0 });
  assert.equal(replay.serverTotalXp, 100);
  assert.equal(db.documents.get(`users/${ownerId}/serverProgressionState/summary`).legacyBaselineXp, 80);
});
