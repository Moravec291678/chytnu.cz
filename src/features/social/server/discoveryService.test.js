import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createDiscoveryService } from "./discoveryService.js";
function fixture({ omitCreatedAt = false } = {}) {
  let time = 1_800_000_000_000; const calls = [];
  const query = Object.fromEntries(["where", "orderBy", "startAfter", "limit"].map(method => [method, (...args) => { calls.push([method,...args]); return query; }]));
  const service = createDiscoveryService({ db: { collection: name => { calls.push(["collection",name]); return query; } },
    repository: { searchProfiles: async () => ({ users: [], boundary: { uid: "hidden_uid", handle: "hidden_handle", ...(omitCreatedAt ? {} : { createdAt: time - 1000 }) }, hasMore: true }) },
    project: () => {}, cursorSecret: "synthetic-unit-cursor-key-at-least-32-characters", now: () => time });
  return { service, calls, advance: () => { time += 16 * 60_000; } };
}
test("search cursor hides skipped identities and uses bounded indexed query", async () => {
  const { service, calls } = fixture();
  const result = await service.search("token", "viewer", { query: "rybar" });
  assert.doesNotMatch(Buffer.from(result.nextCursor, "base64url").toString(), /hidden_uid|hidden_handle/);
  assert.ok(calls.some(row => row[0] === "where" && row[1] === "searchPrefixes" && row[2] === "array-contains" && row[3] === "all:rybar"));
  assert.ok(calls.some(row => row[0] === "limit" && row[1] === 11));
  await service.search("token", "viewer", { query: "RYBÁŘ", cursor: result.nextCursor });
  assert.ok(calls.some(row => row[0] === "startAfter" && row[1] === "hidden_handle" && row[2] === "hidden_uid"));
});
test("cursor rejects tampering, other user/query, mode reuse and expiry", async () => {
  const { service, advance } = fixture();
  const { nextCursor } = await service.search("token", "viewer", { query: "kapr" });
  await assert.rejects(() => service.search("token", "stranger", { query: "kapr", cursor: nextCursor }), /invalid_cursor/);
  await assert.rejects(() => service.search("token", "viewer", { query: "jiny", cursor: nextCursor }), /invalid_cursor/);
  await assert.rejects(() => service.search("token", "viewer", { mode: "new", cursor: nextCursor }), /invalid_cursor/);
  const changed = `${nextCursor.slice(0,20)}${nextCursor[20] === "A" ? "B" : "A"}${nextCursor.slice(21)}`;
  await assert.rejects(() => service.search("token", "viewer", { query: "kapr", cursor: changed }), /invalid_cursor/);
  advance(); await assert.rejects(() => service.search("token", "viewer", { query: "kapr", cursor: nextCursor }), /invalid_cursor/);
});
test("new public members use timestamp and UID keyset pagination", async () => {
  const { service, calls } = fixture();
  const { nextCursor } = await service.search("token", "viewer", { mode: "new" });
  await service.search("token", "viewer", { mode: "new", cursor: nextCursor });
  assert.ok(calls.some(row => row[0] === "orderBy" && row[1] === "createdAt" && row[2] === "desc"));
  assert.ok(calls.some(row => row[0] === "startAfter" && typeof row[1] === "number" && row[2] === "hidden_uid"));
});
test("search can paginate past a stale indexed record without a timestamp", async () => {
  const { service } = fixture({ omitCreatedAt: true });
  const { nextCursor } = await service.search("token", "viewer", { query: "rybar" });
  await assert.doesNotReject(() => service.search("token", "viewer", { query: "rybar", cursor: nextCursor }));
});
