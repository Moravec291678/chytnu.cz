import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, getActiveGuestScopeKey } from "../../catches/data/catchRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { deleteLocalScopeData } from "./localDataDeletion.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

async function resetDatabase(name) {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

function catchRecord(id) {
  const stamp = "2026-10-20T10:00:00.000Z";
  return { id, schemaVersion: 1, createdAt: stamp, updatedAt: stamp, caughtAt: stamp, species: "Kapr", speciesKey: "carp", photos: [], sync: { status: "local", revision: 1 } };
}

test("confirmed local deletion clears only the active scope and its scoped settings", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  const guest = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
  const account = { scopeKey: "account:angler-b", ownerId: "angler-b" };
  await catchRepository.put(catchRecord("guest-catch"), guest);
  await catchRepository.put(catchRecord("account-catch"), account);
  await waterRepository.put({ id: "guest-water", name: "Guest Water" }, guest);
  await waterRepository.put({ id: "account-water", name: "Account Water" }, account);
  const storage = memoryStorage();
  storage.setItem(`chytnu:preferences:v1:${guest.scopeKey}`, "{}");
  storage.setItem(`chytnu:trophy-selection:v1:${guest.scopeKey}`, "[]");

  await deleteLocalScopeData(guest, storage);

  assert.deepEqual(await catchRepository.list(guest), []);
  assert.equal((await catchRepository.list(account)).length, 1);
  assert.deepEqual(await waterRepository.list(guest), []);
  assert.equal((await waterRepository.list(account)).length, 1);
  assert.equal(storage.getItem(`chytnu:preferences:v1:${guest.scopeKey}`), null);
  assert.equal(storage.getItem(`chytnu:trophy-selection:v1:${guest.scopeKey}`), null);
});
