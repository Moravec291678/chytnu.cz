import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotificationRecord, mergeNotificationReadState, normalizeNotificationDeepLink,
  progressionNotificationInput, sortNotificationsNewestFirst, stableNotificationId,
} from "./notificationModel.js";

const scope = { scopeKey: "guest:notice-test", ownerId: null };
const now = new Date("2026-10-28T10:00:00.000Z");

test("notification model validates data and binds records to the active scope", () => {
  const notification = createNotificationRecord({
    id: "notice-1", type: "achievement", title: " Úspěch ", body: "Odemkl(a) jsi odznak.", deepLink: "/achievements",
  }, scope, { now });
  assert.deepEqual(notification, {
    id: "notice-1", type: "achievement", title: "Úspěch", body: "Odemkl(a) jsi odznak.",
    createdAt: now.toISOString(), readAt: null, deepLink: "/achievements", scopeKey: scope.scopeKey, ownerId: null,
  });
  assert.throws(() => createNotificationRecord({ ...notification, type: "unknown" }, scope), /nepodporovaný typ/);
  assert.throws(() => createNotificationRecord({ ...notification, title: " " }, scope), /Název oznámení/);
  assert.throws(() => createNotificationRecord({ ...notification, deepLink: "https://outside.test" }, scope), /bezpečnou stránku/);
  assert.throws(() => createNotificationRecord({ ...notification, id: "bad/id" }, scope), /platné ID/);
  assert.throws(() => createNotificationRecord(notification, { scopeKey: "account:other", ownerId: "someone-else" }), /neodpovídá/);
});

test("deep links are limited to internal app routes", () => {
  assert.equal(normalizeNotificationDeepLink("/catch/fish-1?tab=detail"), "/catch/fish-1?tab=detail");
  for (const unsafe of ["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)", "/outside space"]) {
    assert.equal(normalizeNotificationDeepLink(unsafe), null);
  }
});

test("notification ordering, read merge and stable event notification inputs are deterministic", () => {
  const older = { id: "a", createdAt: "2026-10-27T10:00:00.000Z" };
  const newer = { id: "b", createdAt: "2026-10-28T10:00:00.000Z" };
  assert.deepEqual(sortNotificationsNewestFirst([older, newer]).map((item) => item.id), ["b", "a"]);
  const local = { id: "a", readAt: "2026-10-28T10:00:00.000Z" };
  assert.equal(mergeNotificationReadState(local, { id: "a", readAt: null }).readAt, local.readAt);
  const achievement = progressionNotificationInput({ id: "event-1", type: "achievement.unlocked", xp: 30, createdAt: now.toISOString() }, scope.scopeKey);
  assert.equal(achievement.type, "achievement");
  assert.equal(achievement.deepLink, "/achievements");
  assert.equal(progressionNotificationInput({ id: "xp-1", type: "catch.created" }, scope.scopeKey), null);
  assert.equal(stableNotificationId("challenge", scope.scopeKey, "event-1"), stableNotificationId("challenge", scope.scopeKey, "event-1"));
});
