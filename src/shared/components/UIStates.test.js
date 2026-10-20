import assert from "node:assert/strict";
import test from "node:test";
import { getOfflineNoticeCopy } from "./offlineNoticeCopy.js";

test("offline copy promises sync later only when changes are queued", () => {
  const idle = getOfflineNoticeCopy("offline", 0);
  assert.match(idle.description, /ukládat do tohoto zařízení/);
  assert.doesNotMatch(idle.description, /synchronizace se zkusí/);

  const queued = getOfflineNoticeCopy("offline", 3);
  assert.match(queued.description, /3 změn čeká ve frontě/);
  assert.match(queued.description, /synchronizace se zkusí po obnovení připojení/);
});

test("sync failures have a safe human-readable message and bounded pending count", () => {
  const failed = getOfflineNoticeCopy("error", 2.9);
  assert.equal(failed.title, "Synchronizace se nezdařila");
  assert.equal(failed.description, "Lokální úlovky a výpravy zůstávají uložené. Čekající změny: 2.");
  assert.doesNotMatch(failed.description, /Firebase|permission-denied|Error/);
});
