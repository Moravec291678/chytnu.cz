import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  catchRepository,
  getActiveGuestScopeKey,
  openLocalDatabase,
  APP_META_STORE_NAME,
  ACTIVE_GUEST_SCOPE_KEY,
  LOCAL_PROFILE_STORE_NAME,
  OUTBOX_STORE_NAME,
  PHOTO_BINARY_STORE_NAME,
  photoCloudOutboxRepository,
  retainSessionPhotoBlob,
  SYNC_STATE_STORE_NAME,
  CONFLICT_STORE_NAME,
} from "../../catches/data/catchRepository.js";
import { catchDraftRepository } from "../../catches/data/catchDraftRepository.js";
import { serverProgressionClaimRepository } from "../../progression/data/serverProgressionClaimRepository.js";
import { crewRepository } from "../../crew/data/crewRepository.js";
import { communityInteractionRepository } from "../../community/data/communityInteractionRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { notificationRepository } from "../../notifications/data/notificationRepository.js";
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

async function openDatabaseConnection(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = () => resolve(request.result);
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
  await catchRepository.put({ ...catchRecord("guest-catch"), photos: [{ id: "guest-photo", blob: new Blob(["guest-photo"], { type: "image/jpeg" }) }] }, guest);
  await catchRepository.put({ ...catchRecord("account-catch"), photos: [{ id: "account-photo", blob: new Blob(["account-photo"], { type: "image/jpeg" }) }] }, account);
  await catchDraftRepository.save({ species: "Kapr", lengthCm: "82", notes: "draft profilu A", photos: [{ id: "guest-draft-photo", blob: new Blob(["guest-draft"], { type: "image/jpeg" }) }] }, {}, guest);
  await catchDraftRepository.save({ species: "Štika", lengthCm: "71", notes: "draft profilu B", photos: [{ id: "account-draft-photo", blob: new Blob(["account-draft"], { type: "image/jpeg" }) }] }, {}, account);
  await waterRepository.put({ id: "guest-water", name: "Guest Water" }, guest);
  await waterRepository.put({ id: "account-water", name: "Account Water" }, account);
  await notificationRepository.create({ id: "guest-notice", type: "app_update", title: "Novinka", body: "Aktualizace aplikace.", createdAt: "2026-10-20T10:00:00.000Z", deepLink: "/notifications" }, guest);
  await notificationRepository.create({ id: "account-notice", type: "app_update", title: "Novinka", body: "Aktualizace aplikace.", createdAt: "2026-10-20T10:00:00.000Z", deepLink: "/notifications" }, account);
  const storage = memoryStorage();
  retainSessionPhotoBlob(guest.scopeKey, "session-only-catch", "session-only-photo", new Blob(["session-only"]));
  storage.setItem(`chytnu:preferences:v1:${guest.scopeKey}`, "{}");
  storage.setItem(`chytnu:trophy-selection:v1:${guest.scopeKey}`, "[]");

  const profileDb = await openLocalDatabase();
  const profileTx = profileDb.transaction(LOCAL_PROFILE_STORE_NAME, "readwrite");
  profileTx.objectStore(LOCAL_PROFILE_STORE_NAME).put({ id: guest.scopeKey, kind: "guest" });
  profileTx.objectStore(LOCAL_PROFILE_STORE_NAME).put({ id: account.scopeKey, kind: "account" });
  await new Promise((resolve, reject) => {
    profileTx.oncomplete = resolve;
    profileTx.onerror = () => reject(profileTx.error);
    profileTx.onabort = () => reject(profileTx.error);
  });
  profileDb.close();

  await deleteLocalScopeData(guest, storage);

  assert.deepEqual(await catchRepository.list(guest), []);
  assert.equal((await catchRepository.list(account)).length, 1);
  assert.deepEqual(await waterRepository.list(guest), []);
  assert.equal((await waterRepository.list(account)).length, 1);
  assert.deepEqual(await notificationRepository.list(guest), []);
  assert.equal((await notificationRepository.list(account)).length, 1);
  assert.equal(await catchDraftRepository.get(guest), null);
  const accountDraft = await catchDraftRepository.get(account);
  assert.equal(accountDraft.data.species, "Štika");
  assert.equal(accountDraft.data.lengthCm, "71");
  assert.equal(accountDraft.data.notes, "draft profilu B");
  assert.equal(await accountDraft.data.photos[0].blob.text(), "account-draft", "another scope's draft photo Blob remains readable");
  const db = await openLocalDatabase();
  const binaryTransaction = db.transaction(PHOTO_BINARY_STORE_NAME, "readonly");
  const binaries = await new Promise((resolve, reject) => {
    const request = binaryTransaction.objectStore(PHOTO_BINARY_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const verifyProfileDb = await openLocalDatabase();
  const verifyProfileTx = verifyProfileDb.transaction([LOCAL_PROFILE_STORE_NAME, APP_META_STORE_NAME], "readonly");
  const localProfiles = await new Promise((resolve, reject) => {
    const request = verifyProfileTx.objectStore(LOCAL_PROFILE_STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const activeGuestMeta = await new Promise((resolve, reject) => {
    const request = verifyProfileTx.objectStore(APP_META_STORE_NAME).get(ACTIVE_GUEST_SCOPE_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  verifyProfileDb.close();
  db.close();
  assert.deepEqual(localProfiles.map((profile) => profile.id), [account.scopeKey]);
  assert.equal(activeGuestMeta.scopeKey, guest.scopeKey, "keep the active guest scope identity for future local use");
  assert.deepEqual(binaries.map((binary) => binary.scopeKey), [account.scopeKey]);
  await catchRepository.put({ ...catchRecord("session-only-catch"), photos: [{ id: "session-only-photo", type: "image/jpeg" }] }, guest);
  const sessionOnlyCatch = await catchRepository.get("session-only-catch", guest);
  assert.equal(sessionOnlyCatch.photos[0].blob, undefined, "deleted scope photo recovery blobs are released from memory");
  assert.equal(storage.getItem(`chytnu:preferences:v1:${guest.scopeKey}`), null);
  assert.equal(storage.getItem(`chytnu:trophy-selection:v1:${guest.scopeKey}`), null);
});

test("account deletion clears its pending progression claims without touching guest data", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  const guest = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
  const account = { scopeKey: "account:angler-c", ownerId: "angler-c" };
  await catchRepository.put(catchRecord("guest-kept"), guest);
  await catchRepository.put(catchRecord("account-deleted"), account);
  await serverProgressionClaimRepository.enqueue("account-deleted", account);

  await deleteLocalScopeData(account, memoryStorage());

  assert.equal((await catchRepository.list(guest)).length, 1);
  assert.deepEqual(await catchRepository.list(account), []);
  assert.deepEqual(await serverProgressionClaimRepository.list(account.ownerId), []);
});

test("deletion removes pending photo upload references, binaries, conflicts and sync state only for its scope", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  const deletedScope = { scopeKey: "account:angler-delete", ownerId: "angler-delete" };
  const retainedScope = { scopeKey: "account:angler-keep", ownerId: "angler-keep" };
  await catchRepository.put({ ...catchRecord("catch-delete"), photos: [{ id: "photo-delete", blob: new Blob(["delete"], { type: "image/jpeg" }) }] }, deletedScope);
  await catchRepository.put({ ...catchRecord("catch-keep"), photos: [{ id: "photo-keep", blob: new Blob(["keep"], { type: "image/jpeg" }) }] }, retainedScope);
  const pendingUpload = (scope, catchId, photoId) => ({
    ownerId: scope.ownerId, catchId, photoId, operation: "upload", provider: "cloudinary",
    objectKey: `users/${scope.ownerId}/catches/${catchId}/${photoId}`, sha256: "a".repeat(64),
  });
  await photoCloudOutboxRepository.enqueue(pendingUpload(deletedScope, "catch-delete", "photo-delete"));
  await photoCloudOutboxRepository.enqueue(pendingUpload(retainedScope, "catch-keep", "photo-keep"));

  const db = await openLocalDatabase();
  const tx = db.transaction([SYNC_STATE_STORE_NAME, CONFLICT_STORE_NAME], "readwrite");
  tx.objectStore(SYNC_STATE_STORE_NAME).put({ ownerId: deletedScope.ownerId, cursor: "delete-cursor" });
  tx.objectStore(SYNC_STATE_STORE_NAME).put({ ownerId: retainedScope.ownerId, cursor: "keep-cursor" });
  tx.objectStore(CONFLICT_STORE_NAME).put({ id: "conflict-delete", ownerId: deletedScope.ownerId, scopeKey: deletedScope.scopeKey });
  tx.objectStore(CONFLICT_STORE_NAME).put({ id: "conflict-keep", ownerId: retainedScope.ownerId, scopeKey: retainedScope.scopeKey });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();

  await deleteLocalScopeData(deletedScope, memoryStorage());

  const photoJobs = await photoCloudOutboxRepository.list();
  assert.deepEqual(photoJobs.map((job) => job.scopeKey), [retainedScope.scopeKey]);
  const finalDb = await openLocalDatabase();
  const readTx = finalDb.transaction([OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME, SYNC_STATE_STORE_NAME, CONFLICT_STORE_NAME], "readonly");
  const [outbox, binaries, syncStates, conflicts] = await Promise.all([
    ...[OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME, SYNC_STATE_STORE_NAME, CONFLICT_STORE_NAME].map((name) => new Promise((resolve, reject) => {
      const request = readTx.objectStore(name).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    })),
  ]);
  finalDb.close();
  assert.ok(outbox.every((entry) => entry.scopeKey !== deletedScope.scopeKey));
  assert.deepEqual(binaries.map((binary) => binary.scopeKey), [retainedScope.scopeKey]);
  assert.deepEqual(syncStates.map((state) => state.ownerId), [retainedScope.ownerId]);
  assert.deepEqual(conflicts.map((conflict) => conflict.ownerId), [retainedScope.ownerId]);
});

test("repeated deletion works with both IndexedDB connections open and data stays deleted after reopening", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  await resetDatabase("chytnu-catch-drafts");
  const activeScope = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
  const otherScope = { scopeKey: "account:angler-open-db", ownerId: "angler-open-db" };
  await catchRepository.put(catchRecord("open-db-active"), activeScope);
  await catchRepository.put(catchRecord("open-db-other"), otherScope);
  await catchDraftRepository.save({ notes: "aktivní draft", photos: [{ id: "active-blob", blob: new Blob(["active"]) }] }, {}, activeScope);
  await catchDraftRepository.save({ notes: "cizí draft", photos: [{ id: "other-blob", blob: new Blob(["other"]) }] }, {}, otherScope);

  // Keep one connection to each database open: scoped transactions must not need a database delete/upgrade.
  const mainConnection = await openDatabaseConnection("chytnu-local", 9);
  const draftConnection = await openDatabaseConnection("chytnu-catch-drafts", 1);
  await Promise.all([
    deleteLocalScopeData(activeScope, memoryStorage()),
    deleteLocalScopeData(activeScope, memoryStorage()),
  ]);
  // A later retry after the previous deletion has fully completed is a no-op, not an error.
  await deleteLocalScopeData(activeScope, memoryStorage());

  assert.equal(mainConnection.objectStoreNames.contains("catches"), true);
  assert.equal(draftConnection.objectStoreNames.contains("drafts"), true);
  mainConnection.close();
  draftConnection.close();

  // Repository reads open fresh connections, matching the IndexedDB part of a reload.
  assert.deepEqual(await catchRepository.list(activeScope), []);
  assert.equal(await catchDraftRepository.get(activeScope), null);
  assert.equal((await catchRepository.list(otherScope)).length, 1);
  const otherDraft = await catchDraftRepository.get(otherScope);
  assert.equal(otherDraft.data.notes, "cizí draft");
  assert.equal(await otherDraft.data.photos[0].blob.text(), "other");
});

test("critical profile isolation: deleting profile A removes all listed data and preserves profile B", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  await resetDatabase("chytnu-catch-drafts");
  const profileA = { scopeKey: "account:profile-a", ownerId: "profile-a" };
  const profileB = { scopeKey: "account:profile-b", ownerId: "profile-b" };

  for (const [scope, profile] of [[profileA, "A"], [profileB, "B"]]) {
    const catchId = `profile-${profile.toLowerCase()}-catch`;
    const photoId = `profile-${profile.toLowerCase()}-photo`;
    await catchRepository.put({ ...catchRecord(catchId), photos: [{ id: photoId, blob: new Blob([`catch-${profile}`], { type: "image/jpeg" }) }] }, scope);
    await catchDraftRepository.save({ notes: `draft-${profile}`, photos: [{ id: `draft-photo-${profile}`, blob: new Blob([`draft-${profile}`], { type: "image/jpeg" }) }] }, {}, scope);
    await notificationRepository.create({ id: `profile-${profile}-notification`, type: "app_update", title: `notice-${profile}`, body: "test", createdAt: "2026-10-28T10:00:00.000Z", deepLink: "/notifications" }, scope);
    await photoCloudOutboxRepository.enqueue({
      ownerId: scope.ownerId, catchId, photoId, operation: "upload", provider: "cloudinary",
      objectKey: `users/${scope.ownerId}/catches/${catchId}/${photoId}`, sha256: "b".repeat(64),
    });
  }

  const db = await openLocalDatabase();
  const tx = db.transaction(["progressionEvents"], "readwrite");
  for (const scope of [profileA, profileB]) {
    tx.objectStore("progressionEvents").put({
      id: `${scope.scopeKey}|test.reward`, scopeKey: scope.scopeKey, ownerId: scope.ownerId,
      type: "catch.created", xp: 10, sourceEntityType: "catch", sourceEntityId: `${scope.ownerId}-catch`,
    });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();

  await deleteLocalScopeData(profileA, memoryStorage());

  assert.deepEqual(await catchRepository.list(profileA), []);
  assert.equal((await catchRepository.list(profileB)).length, 1);
  assert.equal(await (await catchRepository.list(profileB))[0].photos[0].blob.text(), "catch-B");
  assert.equal(await catchDraftRepository.get(profileA), null);
  const retainedDraft = await catchDraftRepository.get(profileB);
  assert.equal(retainedDraft.data.notes, "draft-B");
  assert.equal(await retainedDraft.data.photos[0].blob.text(), "draft-B");
  assert.deepEqual(await notificationRepository.list(profileA), []);
  assert.equal((await notificationRepository.list(profileB)).length, 1);

  const verifyDb = await openLocalDatabase();
  const verifyTx = verifyDb.transaction(["progressionEvents", OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME], "readonly");
  const [progressionA, progressionB, outboxA, outboxB, binariesA, binariesB] = await Promise.all([
    ...["progressionEvents", OUTBOX_STORE_NAME, PHOTO_BINARY_STORE_NAME].flatMap((storeName) => [profileA, profileB].map((scope) => new Promise((resolve, reject) => {
      const request = verifyTx.objectStore(storeName).index("scopeKey").getAll(scope.scopeKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }))),
  ]);
  verifyDb.close();
  assert.deepEqual(progressionA, []);
  assert.equal(progressionB.length, 1);
  assert.deepEqual(outboxA, []);
  assert.equal(outboxB.length, 2, "Catch sync and pending photo upload remain for profile B");
  assert.equal(binariesA.length, 0, "photo binary record count for deleted scope is zero");
  assert.equal(binariesB.length, 1, "photo binary record for the other scope still exists");
  assert.equal(await new Blob([binariesB[0].bytes], { type: binariesB[0].type }).text(), "catch-B");
});

test("deleted draft, photo binary, pending upload and sync state do not reappear after repository reload", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  await resetDatabase("chytnu-catch-drafts");
  const scope = { scopeKey: "account:reload-deleted", ownerId: "reload-deleted" };
  await catchRepository.put({ ...catchRecord("reload-catch"), photos: [{ id: "reload-photo", blob: new Blob(["reload-binary"], { type: "image/jpeg" }) }] }, scope);
  await catchDraftRepository.save({ species: "Kapr", lengthCm: "82", notes: "pokus", photos: [{ id: "reload-draft-photo", blob: new Blob(["reload-draft"], { type: "image/jpeg" }) }] }, {}, scope);
  await photoCloudOutboxRepository.enqueue({
    ownerId: scope.ownerId, catchId: "reload-catch", photoId: "reload-photo", operation: "upload",
    provider: "cloudinary", objectKey: "users/reload-deleted/catches/reload-catch/reload-photo", sha256: "c".repeat(64),
  });
  const initialDb = await openLocalDatabase();
  const initialTx = initialDb.transaction(SYNC_STATE_STORE_NAME, "readwrite");
  initialTx.objectStore(SYNC_STATE_STORE_NAME).put({ ownerId: scope.ownerId, cursor: "must-not-return" });
  await new Promise((resolve, reject) => {
    initialTx.oncomplete = resolve;
    initialTx.onerror = () => reject(initialTx.error);
    initialTx.onabort = () => reject(initialTx.error);
  });
  initialDb.close();

  await deleteLocalScopeData(scope, memoryStorage());

  // Fresh handles after deletion model the repositories reopening on app reload.
  assert.deepEqual(await catchRepository.list(scope), []);
  assert.equal(await catchDraftRepository.get(scope), null);
  assert.deepEqual(await photoCloudOutboxRepository.list().then((jobs) => jobs.filter((job) => job.scopeKey === scope.scopeKey)), []);
  const reopenedDb = await openLocalDatabase();
  const reopenedTx = reopenedDb.transaction([PHOTO_BINARY_STORE_NAME, SYNC_STATE_STORE_NAME], "readonly");
  const readAll = (storeName) => new Promise((resolve, reject) => {
    const request = reopenedTx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const [binaries, syncStates] = await Promise.all([readAll(PHOTO_BINARY_STORE_NAME), readAll(SYNC_STATE_STORE_NAME)]);
  reopenedDb.close();
  assert.equal(binaries.filter((binary) => binary.scopeKey === scope.scopeKey).length, 0);
  assert.equal(syncStates.filter((state) => state.ownerId === scope.ownerId).length, 0);
});

test("deletion removes scoped Crew and Community data but preserves another profile", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  await resetDatabase("chytnu-crew-local");
  await resetDatabase("chytnu-community-local");
  const profileA = { scopeKey: "account:crew-community-a", ownerId: "crew-community-a" };
  const profileB = { scopeKey: "account:crew-community-b", ownerId: "crew-community-b" };
  await crewRepository.create({ name: "Crew A" }, profileA);
  await crewRepository.create({ name: "Crew B" }, profileB);
  for (const [scope, label] of [[profileA, "A"], [profileB, "B"]]) {
    await communityInteractionRepository.createComment({ catchId: "shared-catch", text: `komentář ${label}`, scope });
    await communityInteractionRepository.setOwnReaction({ catchId: "shared-catch", type: "like", scope });
    await communityInteractionRepository.createReport({ catchId: "shared-catch", reason: "spam", scope });
  }

  await deleteLocalScopeData(profileA, memoryStorage());

  assert.equal(await crewRepository.get(profileA), null);
  assert.equal((await crewRepository.get(profileB)).name, "Crew B");
  assert.deepEqual(await communityInteractionRepository.listComments("shared-catch", profileA), []);
  assert.equal((await communityInteractionRepository.listComments("shared-catch", profileB))[0].text, "komentář B");
  assert.equal(await communityInteractionRepository.getOwnReaction("shared-catch", profileA), null);
  assert.equal((await communityInteractionRepository.getOwnReaction("shared-catch", profileB)).type, "like");
  assert.equal(await communityInteractionRepository.getOwnReport("shared-catch", profileA), null);
  assert.equal((await communityInteractionRepository.getOwnReport("shared-catch", profileB)).reason, "spam");
});

test("legacy Waters deletion removes only rows with matching scope and leaves unowned records untouched", async () => {
  await resetDatabase("chytnu-local");
  await resetDatabase("chytnu-waters");
  const profileA = { scopeKey: "guest:legacy-a", ownerId: null };
  const profileB = { scopeKey: "guest:legacy-b", ownerId: null };
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("chytnu-waters", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("waters", { keyPath: "id" });
      request.result.createObjectStore("waterChat", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(["waters", "waterChat"], "readwrite");
  tx.objectStore("waters").put({ id: "legacy-water-a", scopeKey: profileA.scopeKey, name: "A" });
  tx.objectStore("waters").put({ id: "legacy-water-b", scopeKey: profileB.scopeKey, name: "B" });
  tx.objectStore("waters").put({ id: "legacy-water-unowned", name: "Bez známého scope" });
  tx.objectStore("waterChat").put({ id: "legacy-chat-a", scopeKey: profileA.scopeKey, waterId: "legacy-water-a", text: "A" });
  tx.objectStore("waterChat").put({ id: "legacy-chat-b", scopeKey: profileB.scopeKey, waterId: "legacy-water-b", text: "B" });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();

  await deleteLocalScopeData(profileA, memoryStorage());

  const verifyDb = await openDatabaseConnection("chytnu-waters", 1);
  const verifyTx = verifyDb.transaction(["waters", "waterChat"], "readonly");
  const readAll = (storeName) => new Promise((resolve, reject) => {
    const request = verifyTx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const [waters, chats] = await Promise.all([readAll("waters"), readAll("waterChat")]);
  verifyDb.close();
  assert.deepEqual(waters.map((item) => item.id).sort(), ["legacy-water-b", "legacy-water-unowned"]);
  assert.deepEqual(chats.map((item) => item.id), ["legacy-chat-b"]);
});
