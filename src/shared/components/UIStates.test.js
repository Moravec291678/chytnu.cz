import assert from "node:assert/strict";
import test from "node:test";
import { getOfflineNoticeCopy } from "./offlineNoticeCopy.js";

test("offline copy promises sync later only when changes are queued", () => {
  const idle = getOfflineNoticeCopy("offline", 0);
  assert.match(idle.description, /ukládat do tohoto zařízení/);
  assert.doesNotMatch(idle.description, /synchronizace se zkusí/);

  const queued = getOfflineNoticeCopy("offline", 3);
  assert.match(queued.description, /3 změn se odešle po obnovení připojení/);
});

test("sync failures have a safe human-readable message and bounded pending count", () => {
  const failed = getOfflineNoticeCopy("error", 2.9);
  assert.equal(failed.title, "Synchronizaci se nepodařilo dokončit");
  assert.equal(failed.description, "Úlovky a vycházky zůstávají uložené. Čekající změny: 2.");
  assert.doesNotMatch(failed.description, /Firebase|permission-denied|Error/);
});

test("sync notices distinguish server permission and connectivity failures", () => {
  assert.match(getOfflineNoticeCopy("error", 2, "permission_denied").title, /nepodařilo povolit/);
  assert.match(getOfflineNoticeCopy("error", 1, "unavailable").title, /Čeká se na připojení/);
});
