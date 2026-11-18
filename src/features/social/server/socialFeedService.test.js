import assert from "node:assert/strict";
import { test } from "node:test";
import { createSocialFeedService } from "./socialFeedService.js";
import { createSocialCursor } from "./socialCursor.js";
import { socialEntrySection } from "./socialEntryService.js";

function fixture(rows = [], state = {}) {
  let time = 1800000000000;
  const calls = [], checked = [];
  const query = Object.fromEntries(["where", "orderBy", "startAfter", "limit"].map(method => [method, (...args) => { calls.push([method, ...args]); return query; }]));
  const docs = rows.map((row, i) => ({ id: (100 - i).toString(16).padStart(64, "0"), data: () => ({ createdAt: time, ...row, id: (100 - i).toString(16).padStart(64, "0") }) }));
  const db = { collection: () => query, doc: path => path, runTransaction: work => work({ get: async target => target === query ? { docs, size: docs.length } : { exists: !!state[target], data: () => state[target] } }) };
  const cursors = createSocialCursor({ secret: "synthetic-feed-unit-secret-at-least-32", now: () => time });
  const publications = { section: row => row.kind ? socialEntrySection(row.kind) : row.sourcePhotoId ? "gallery" : "catches", guard: async () => { if (state["accountDeletions/viewer"]) throw new Error("account_unavailable"); if (state["adminConfig/social"]?.postsEnabled === false) throw new Error("social_disabled"); }, permitted: async (_tx, _uid, row, options) => { checked.push([row, options]); return row.denied ? null : { row, profile: row.profile ?? { visibility: "public", sections: { catches: "public", gallery: "public" } }, audience: options.previewAudience ?? row.audience ?? "stranger" }; }, dto: allowed => ({ id: allowed.row.id }) };
  return { service: createSocialFeedService({ db, publications, cursors }), cursors, calls, checked, docs, expire: () => { time += 900001; } };
}

test("feed uses bounded descending indexed candidates and stops at requested safe count", async () => {
  const f = fixture(Array.from({ length: 21 }, (_, i) => ({ denied: i < 2 })));
  const page = await f.service.list("viewer", { mode: "global", limit: 3 });
  assert.equal(page.posts.length, 3); assert.equal(f.checked.length, 5);
  assert.ok(f.calls.some(call => call[0] === "where" && call[1] === "visibility" && call[2] === "==" && call[3] === "public"));
  assert.ok(f.calls.some(call => call[0] === "limit" && call[1] === 21));
  assert.ok(f.calls.some(call => call[0] === "orderBy" && call[1] === "createdAt" && call[2] === "desc"));
  assert.equal(f.cursors.decode(page.nextCursor, "feed:viewer:global:3"), `1800000000000_${f.docs[4].id}`);
  await f.service.list("viewer", { mode: "global", limit: 3, cursor: page.nextCursor });
  assert.ok(f.calls.some(call => call[0] === "startAfter" && call[1] === 1800000000000 && call[2] === f.docs[4].id));
});

test("friends excludes self/strangers and never authorizes lookahead", async () => {
  const f = fixture([{ ownerUid: "viewer", audience: "owner" }, ...Array.from({ length: 20 }, (_, i) => ({ audience: i === 0 ? "friend" : "stranger" }))]);
  const page = await f.service.list("viewer", { mode: "friends" });
  assert.equal(page.posts.length, 1); assert.equal(f.checked.length, 19); assert.ok(page.nextCursor);
  assert.ok(f.calls.some(call => call[0] === "where" && call[2] === "in" && JSON.stringify(call[3]) === '["public","friends"]'));
});

test("empty filtered window continues and own public posts use stranger projection", async () => {
  const f = fixture(Array.from({ length: 21 }, () => ({ denied: true })));
  const page = await f.service.list("viewer", {});
  assert.deepEqual(page.posts, []); assert.equal(f.checked.length, 20); assert.ok(page.nextCursor);
  const own = fixture([{ ownerUid: "viewer" }]);
  const result = await own.service.list("viewer", {});
  assert.deepEqual(own.checked[0][1], { previewAudience: "stranger" }); assert.equal(result.nextCursor, null);
});

test("global excludes friend-only profiles and sections even for an actual friend", async () => {
  const f = fixture([
    { audience: "friend", profile: { visibility: "friends", sections: { catches: "public" } } },
    { audience: "friend", profile: { visibility: "public", sections: { catches: "friends" } } },
    { audience: "friend", sourcePhotoId: "photo", profile: { visibility: "public", sections: { catches: "public", gallery: "friends" } } },
    { audience: "friend" },
  ]);
  assert.equal((await f.service.list("viewer", {})).posts.length, 1);
  assert.equal((await f.service.list("viewer", { mode: "friends" })).posts.length, 4);
});

test("global achievement and milestone posts use achievements section", async () => {
  const f = fixture([
    { kind: "experience", profile: { visibility: "public", sections: { catches: "public", achievements: "private" } } },
    { kind: "achievement", profile: { visibility: "public", sections: { catches: "public", achievements: "friends" } } },
    { kind: "milestone", profile: { visibility: "public", sections: { catches: "private", achievements: "public" } } },
  ]);
  const page = await f.service.list("viewer", {});
  assert.equal(page.posts.length, 2);
  assert.deepEqual(page.posts.map(row => row.id), [f.docs[0].id, f.docs[2].id]);
});

test("cursors reject tampering, reuse by user/mode/limit and expiry", async () => {
  const f = fixture(Array.from({ length: 21 }, () => ({})));
  const { nextCursor: cursor } = await f.service.list("viewer", { limit: 3 });
  for (const [uid, payload] of [["other", { limit: 3 }], ["viewer", { mode: "friends", limit: 3 }], ["viewer", { limit: 10 }]]) await assert.rejects(f.service.list(uid, { ...payload, cursor }), /invalid_cursor/);
  await assert.rejects(f.service.list("viewer", { cursor: `${cursor.slice(0, -1)}!`, limit: 3 }), /invalid_cursor/);
  const invalid = f.cursors.encode("9999999999999999_" + "a".repeat(64), "feed:viewer:global:3");
  await assert.rejects(f.service.list("viewer", { cursor: invalid, limit: 3 }), /invalid_cursor/);
  f.expire(); await assert.rejects(f.service.list("viewer", { cursor, limit: 3 }), /invalid_cursor/);
});

test("empty feed still requires authenticated active viewer and enabled posts", async () => {
  await assert.rejects(fixture().service.list(null, {}), /authentication_required/);
  await assert.rejects(fixture([], { "accountDeletions/viewer": {} }).service.list("viewer", {}), /account_unavailable/);
  await assert.rejects(fixture([], { "adminConfig/social": { postsEnabled: false } }).service.list("viewer", {}), /social_disabled/);
  for (const payload of [{ mode: "nearby" }, { limit: 20 }, { limit: "3" }]) await assert.rejects(fixture().service.list("viewer", payload), /invalid_request/);
});
