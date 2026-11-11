import assert from "node:assert/strict";
import { test } from "node:test";
import { relationshipView, transitionRelationship } from "./relationshipModel.js";
const t = 1_800_000_000_000;
const move = (record, uid, operation, extra = {}) => transitionRelationship({ record, uid, targetUid: uid === "A" ? "B" : "A", operation, now: t, ...extra });
const pending = () => move(null, "A", "request").record;
const accepted = () => move(pending(), "B", "accept").record;

test("friendship view covers all states without disclosing actor metadata", () => {
  assert.deepEqual(relationshipView(null, "A", { canRequest: true }), { status: "none", revision: 0, canRequest: true });
  const p = pending(), a = accepted();
  assert.equal(relationshipView(p, "A").status, "outgoing"); assert.equal(relationshipView(p, "B").status, "incoming");
  assert.equal(relationshipView(a, "A", { canRequest: true }).status, "friends"); assert.equal(relationshipView(a, "A", { canRequest: true }).canRequest, false);
  for (const [op, actor, source, expected] of [["reject", "B", p, "rejected"], ["cancel", "A", p, "cancelled"], ["unfriend", "B", a, "unfriended"]]) {
    const record = move(source, actor, op).record;
    assert.deepEqual(relationshipView(record, "A", { canRequest: true }), { status: expected, revision: record.revision, canRequest: true });
  }
  assert.deepEqual(relationshipView(a, "A", { blocked: true, canRequest: true }), { status: "blocked", revision: 2, canRequest: false });
  assert.equal(relationshipView({ ...a, status: "blocked" }, "B").status, "blocked");
  assert.deepEqual(relationshipView(a, "C", { canRequest: true }), { status: "none", revision: 0, canRequest: false });
});
test("canonical transitions preserve a single pair, increase revisions and emit bounded events", () => {
  const p = move(null, "B", "request"); assert.equal(p.eventType, "requested"); assert.deepEqual(p.record.memberUids, ["A", "B"]);
  const a = move(p.record, "A", "accept", { now: t + 1, expectedRevision: 1 });
  assert.equal(a.eventType, "accepted"); assert.equal(a.record.revision, 2); assert.equal(a.record.createdAt, t);
  const u = move(a.record, "B", "unfriend", { now: t + 2 });
  assert.equal(u.record.status, "unfriended"); assert.equal(u.record.revision, 3); assert.equal(u.eventType, "removed");
});
test("duplicate and reversed requests never auto-accept or create a new revision", () => {
  const p = pending();
  for (const actor of ["A", "B"]) { const retry = move(p, actor, "request"); assert.equal(retry.changed, false); assert.deepEqual(retry.record, p); }
  assert.equal(move(p, "A", "request", { expectedRevision: 0 }).changed, false);
  assert.throws(() => move(p, "B", "request", { expectedRevision: 0 }), /relationship_conflict/);
  assert.equal(move(accepted(), "A", "request").changed, false);
});
test("recipient alone accepts or rejects, and requester alone cancels", () => {
  const p = pending();
  assert.throws(() => move(p, "A", "accept"), /invalid_request/);
  assert.throws(() => move(p, "A", "reject"), /invalid_request/);
  assert.throws(() => move(p, "B", "cancel"), /invalid_request/);
  assert.throws(() => transitionRelationship({ record: p, uid: "C", targetUid: "A", operation: "accept", now: t }), /invalid_request/);
  assert.equal(move(p, "B", "reject").record.status, "rejected");
  assert.equal(move(p, "A", "cancel").record.status, "cancelled");
});
test("accepted/terminal replays are idempotent only for the authorized actor", () => {
  const a = accepted();
  assert.equal(move(a, "B", "accept", { expectedRevision: 1 }).changed, false);
  assert.throws(() => move(a, "A", "accept"), /invalid_request/);
  for (const [source, actor, op] of [[pending(), "B", "reject"], [pending(), "A", "cancel"], [a, "B", "unfriend"]]) {
    const result = move(source, actor, op).record;
    assert.equal(move(result, actor, op, { expectedRevision: source.revision }).changed, false);
    assert.equal(move(result, actor, "remove").changed, false);
    assert.throws(() => move(result, actor === "A" ? "B" : "A", op), /invalid_request|relationship_conflict/);
  }
});
test("legacy remove chooses cancel, reject or unfriend without deleting audit state", () => {
  assert.equal(move(pending(), "A", "remove").record.status, "cancelled");
  assert.equal(move(pending(), "B", "remove").record.status, "rejected");
  assert.equal(move(accepted(), "A", "remove").record.status, "unfriended");
  assert.deepEqual(move(null, "A", "remove"), { record: null, changed: false, eventType: null });
});
test("new requests after terminal states need fresh operation intent and rejection cooldown", () => {
  const rejected = move(pending(), "B", "reject").record;
  assert.throws(() => move(rejected, "A", "request"), /relationship_conflict/);
  assert.throws(() => move(rejected, "A", "request", { operationId: "new-op" }), /relationship_conflict/);
  const later = move(rejected, "A", "request", { operationId: "new-op", now: t + 24 * 60 * 60_000 });
  assert.equal(later.record.status, "pending"); assert.equal(later.record.revision, 3);
  for (const terminal of [move(pending(), "A", "cancel").record, move(accepted(), "B", "unfriend").record]) {
    assert.throws(() => move(terminal, "B", "request"), /relationship_conflict/);
    assert.equal(move(terminal, "B", "request", { operationId: "new-op" }).record.requestedBy, "B");
  }
});
test("stale revisions cannot overwrite a later accept or terminal transition", () => {
  assert.throws(() => move(accepted(), "A", "cancel", { expectedRevision: 1 }), /relationship_conflict/);
  const cancelled = move(pending(), "A", "cancel").record;
  assert.throws(() => move(cancelled, "A", "request", { operationId: "new-op", expectedRevision: 1 }), /relationship_conflict/);
});
test("malformed records, forged membership, self pairs and invalid operation IDs fail closed", () => {
  const p = pending();
  for (const changed of [{ memberUids: ["A", "C"] }, { requestedBy: "C" }, { revision: -1 }, { revision: 1.5 }, { status: "owner" }, { lastActorUid: "C" }])
    assert.throws(() => move({ ...p, ...changed }, "B", "accept"), /invalid_request/);
  for (const changed of [{ uid: "A", targetUid: "A" }, { uid: "../A", targetUid: "B" }, { operationId: "../other" }, { expectedRevision: null }, { now: -1 }])
    assert.throws(() => transitionRelationship({ uid: "A", targetUid: "B", operation: "request", now: t, ...changed }), /invalid_request/);
  assert.throws(() => move({ ...p, status: "blocked" }, "A", "request"), /relationship_conflict/);
  assert.throws(() => move({ ...p, updatedAt: t + 1 }, "A", "request"), /relationship_conflict/);
});
test("legacy pending/accepted records without revision or actor migrate on the next real transition", () => {
  const old = { memberUids: ["B", "A"], requestedBy: "A", status: "pending", createdAt: t - 1, updatedAt: t - 1 };
  const next = move(old, "B", "accept").record;
  assert.equal(next.revision, 1); assert.equal(next.lastActorUid, "B"); assert.deepEqual(next.memberUids, ["A", "B"]);
  assert.deepEqual(old.memberUids, ["B", "A"]);
});
