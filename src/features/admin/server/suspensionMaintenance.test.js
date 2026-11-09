import test from "node:test";
import assert from "node:assert/strict";
import { restoreExpiredSuspensions } from "./suspensionMaintenance.js";

const now = Date.parse("2026-11-09T12:00:00Z");
function fixture({ uid = "user", deleted = false, race = "", fail = false } = {}) {
  const rows = new Map([[`accountSuspensions/${uid}`, { expiresAt: "2026-11-08T12:00:00Z", updatedAt: "old" }], [`adminAccounts/${uid}`, { suspended: true, revision: 2 }]]);
  if (deleted) rows.set(`accountDeletions/${uid}`, {});
  const ref = path => ({ path, id: path.split("/").at(-1), get: async () => snap(path) });
  const snap = path => ({ id: path.split("/").at(-1), ref: ref(path), exists: rows.has(path), data: () => rows.get(path) });
  const initial = { ...rows.get(`accountSuspensions/${uid}`) };
  const db = { doc: ref, collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ ...snap(`accountSuspensions/${uid}`), data: () => initial }] }) }) }) }),
    runTransaction: async fn => fn({ get: doc => doc.get(), set: (doc, data) => rows.set(doc.path, data), delete: doc => rows.delete(doc.path) }) };
  const calls = [];
  const auth = { updateUser: async (id, patch) => {
    calls.push([id, patch.disabled]);
    if (fail && !patch.disabled) throw new Error("Auth unavailable");
    if (!patch.disabled && race === "newer") rows.set(`accountSuspensions/${uid}`, { expiresAt: "2027-01-01T00:00:00Z", updatedAt: "new" });
    if (!patch.disabled && race === "delete") { rows.delete(`accountSuspensions/${uid}`); rows.set(`accountDeletions/${uid}`, {}); }
  } };
  return { db, auth, rows, calls };
}
test("expired suspension restores Auth and account with immutable system audit", async () => {
  const f = fixture(); assert.deepEqual(await restoreExpiredSuspensions({ ...f, now }), { restored: 1, failed: 0 });
  assert.deepEqual(f.calls, [["user", false]]); assert.equal(f.rows.get("adminAccounts/user").revision, 3);
  assert.equal(f.rows.has("accountSuspensions/user"), false); assert.equal([...f.rows.keys()].filter(key => key.startsWith("adminAudit/")).length, 1);
});
test("maintenance never enables owner or an account being deleted", async () => {
  for (const options of [{ uid: "owner" }, { deleted: true }]) { const f = fixture(options); await restoreExpiredSuspensions({ ...f, now, ownerUid: "owner" }); assert.equal(f.calls.length, 0); }
});
test("newer suspension and concurrent deletion re-disable Auth", async () => {
  for (const race of ["newer", "delete"]) { const f = fixture({ race }); assert.equal((await restoreExpiredSuspensions({ ...f, now })).restored, 0); assert.deepEqual(f.calls, [["user", false], ["user", true]]); }
});
test("Auth failure preserves suspension and is retryable", async () => {
  const f = fixture({ fail: true }); assert.equal((await restoreExpiredSuspensions({ ...f, now })).failed, 1); assert.equal(f.rows.has("accountSuspensions/user"), true);
});
