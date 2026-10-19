import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from "firebase/firestore";
import "fake-indexeddb/auto";
import { connectStorageEmulator, getBytes, getStorage, listAll, ref } from "firebase/storage";
import { catchRepository, getActiveGuestScopeKey, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createFirebasePhotoStorage } from "../src/features/sync/data/firebasePhotoStorage.js";
import { createFirestoreSyncAdapter } from "../src/features/sync/data/firestoreSyncAdapter.js";
import { createSyncPort, SyncPortError } from "../src/features/sync/data/syncPort.js";
import { createSyncService } from "../src/features/sync/data/syncService.js";
import { linkGuestData } from "../src/features/sync/data/localSyncRepository.js";

const projectId = "demo-chytnucz-local";
const apps = [];
const databaseName = "chytnu-local";

async function resetLocalDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Testovací IndexedDB zůstala otevřená."));
  });
}

function makeClient(name) {
  const app = initializeApp({
    apiKey: "demo-api-key", authDomain: "localhost", projectId, storageBucket: `${projectId}.appspot.com`,
  }, name);
  apps.push(app);
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const storage = getStorage(app);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  return { app, auth, db, storage };
}

function makeCatch(id, ownerId, blob) {
  const stamp = new Date().toISOString();
  return {
    schemaVersion: 1, id, ownerId, createdAt: stamp, updatedAt: stamp, caughtAt: stamp,
    species: "Kapr", speciesKey: "carp", speciesLatin: null, weightKg: null, lengthCm: null,
    girthCm: null, fightMinutes: null, locationName: "Labe", waterNumber: null, gpsLocation: "",
    waterDepthM: null, bottomType: null, tripId: null, method: null, baits: [], result: "released",
    photos: [{ id: "photo-1", name: "kapr.jpg", type: "image/jpeg", blob }],
    notes: "synthetic private photo sync fixture", isFavorite: false,
    sync: { status: "local", revision: 1 },
  };
}

function makeService(client, photoStorage, now = () => Date.now()) {
  const adapter = createFirestoreSyncAdapter({
    db: client.db,
    getCurrentUserId: () => client.auth.currentUser?.uid ?? null,
  });
  return createSyncService({
    port: createSyncPort(adapter),
    photoStorage,
    getCurrentOwnerId: () => client.auth.currentUser?.uid ?? null,
    now,
  });
}

try {
  await resetLocalDatabase();
  const client = makeClient(`photo-test-${crypto.randomUUID()}`);
  const email = `photo-${crypto.randomUUID()}@example.test`;
  const password = "local-photo-test-password-123";
  const credential = await createUserWithEmailAndPassword(
    client.auth,
    email,
    password,
  );
  const ownerId = credential.user.uid;
  const accountScope = { scopeKey: `account:${ownerId}`, ownerId };
  const catchId = `catch-${crypto.randomUUID()}`;
  const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x10, 0x20, 0x30]);
  const blob = new Blob([imageBytes], { type: "image/jpeg" });
  await catchRepository.put(makeCatch(catchId, ownerId, blob), accountScope);

  const realPhotoStorage = createFirebasePhotoStorage({
    storage: client.storage,
    getCurrentUserId: () => client.auth.currentUser?.uid ?? null,
  });
  let failFirstUpload = true;
  const flakyPhotoStorage = {
    ...realPhotoStorage,
    upload: async (args) => {
      if (failFirstUpload) {
        failFirstUpload = false;
        throw new SyncPortError("unavailable", "synthetic interrupted upload");
      }
      return realPhotoStorage.upload(args);
    },
  };
  const firstDevice = makeService(client, flakyPhotoStorage, () => Date.now() + 60_000);
  const interrupted = await firstDevice.run(ownerId);
  assert.equal(interrupted.status, "error", "failed upload must stay visible as a sync error");
  assert.equal((await outboxRepository.list()).length, 1, "failed photo must keep its Catch operation queued");
  const queuedRecord = await catchRepository.get(catchId, accountScope);
  assert.equal(queuedRecord.photos[0].blob.size, imageBytes.byteLength, "failed upload must retain the IndexedDB Blob");

  const retried = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(retried.status, "success", retried.error);
  assert.equal((await outboxRepository.list()).length, 0, "successful retry must acknowledge the Catch operation");
  const localAfterUpload = await catchRepository.get(catchId, accountScope);
  assert.equal(localAfterUpload.sync.photoStatus, "synced");
  assert.equal(localAfterUpload.photos[0].blob.size, imageBytes.byteLength);

  const remote = await getDoc(doc(client.db, "users", ownerId, "catches", catchId));
  const remotePhoto = remote.data().photos[0];
  assert.equal(remote.data().photoState, "metadata-only", "Firestore stores metadata only; bytes stay in Storage");
  assert.equal(remotePhoto.size, imageBytes.byteLength);
  assert.match(remotePhoto.sha256, /^[a-f0-9]{64}$/);
  assert.equal(remotePhoto.storagePath, `users/${ownerId}/catches/${catchId}/photos/photo-1/${remotePhoto.sha256}`);
  assert.equal(JSON.stringify(remote.data()).includes("blob"), false);
  assert.deepEqual([...new Uint8Array(await getBytes(ref(client.storage, remotePhoto.storagePath)))], [...imageBytes]);

  await resetLocalDatabase();
  const secondDevice = await makeService(client, realPhotoStorage).run(ownerId);
  assert.equal(secondDevice.status, "success", secondDevice.error);
  const restored = await catchRepository.get(catchId, accountScope);
  assert.equal(restored.photos[0].photoStatus, "synced");
  assert.equal(restored.photos[0].blob.size, imageBytes.byteLength, "second device must restore the photo Blob locally");
  assert.deepEqual([...new Uint8Array(await restored.photos[0].blob.arrayBuffer())], [...imageBytes]);

  const oldPath = restored.photos[0].storagePath;
  const replacementBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x40, 0x50]);
  await catchRepository.put({
    ...restored,
    updatedAt: new Date().toISOString(),
    photos: [{ id: "photo-2", name: "kapr-novy.jpg", type: "image/jpeg", blob: new Blob([replacementBytes], { type: "image/jpeg" }) }],
    sync: { ...restored.sync, revision: restored.sync.revision + 1 },
  }, accountScope);
  let failCleanup = true;
  const cleanupInterrupted = {
    ...realPhotoStorage,
    deleteUnreferenced: async (args) => {
      if (failCleanup) {
        failCleanup = false;
        throw new SyncPortError("unavailable", "synthetic interrupted cleanup after upload");
      }
      return realPhotoStorage.deleteUnreferenced(args);
    },
  };
  const uploadCompletedButCleanupFailed = await makeService(client, cleanupInterrupted, () => Date.now() + 60_000).run(ownerId);
  assert.equal(uploadCompletedButCleanupFailed.status, "error");
  assert.equal((await outboxRepository.list()).length, 1, "post-upload cleanup failure must keep the operation queued");
  assert.equal((await catchRepository.get(catchId, accountScope)).sync.photoStatus, "local-only");
  const replaced = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(replaced.status, "success", replaced.error);
  const replacedRemote = await getDoc(doc(client.db, "users", ownerId, "catches", catchId));
  const replacementPath = replacedRemote.data().photos[0].storagePath;
  assert.notEqual(replacementPath, oldPath, "photo replacement must use a new immutable content path");
  assert.deepEqual([...new Uint8Array(await getBytes(ref(client.storage, replacementPath)))], [...replacementBytes]);
  await assert.rejects(getBytes(ref(client.storage, oldPath)), (error) => error.code === "storage/unauthorized");

  const current = await catchRepository.get(catchId, accountScope);
  await catchRepository.put({
    ...current,
    updatedAt: new Date().toISOString(),
    photos: [],
    sync: { ...current.sync, revision: current.sync.revision + 1 },
  }, accountScope);
  let failRemovalCleanup = true;
  const removalCleanupInterrupted = {
    ...realPhotoStorage,
    deleteUnreferenced: async (args) => {
      if (failRemovalCleanup) {
        failRemovalCleanup = false;
        throw new SyncPortError("unavailable", "synthetic interrupted cleanup after photo removal");
      }
      return realPhotoStorage.deleteUnreferenced(args);
    },
  };
  const removalInterrupted = await makeService(client, removalCleanupInterrupted, () => Date.now() + 60_000).run(ownerId);
  assert.equal(removalInterrupted.status, "error");
  assert.equal((await outboxRepository.list()).length, 1, "photo removal cleanup failure must remain queued");
  const removedPhoto = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(removedPhoto.status, "success", removedPhoto.error);
  assert.deepEqual((await getDoc(doc(client.db, "users", ownerId, "catches", catchId))).data().photos, []);
  assert.equal((await listAll(ref(client.storage, replacementPath.slice(0, replacementPath.lastIndexOf("/"))))).items.length, 0);
  await assert.rejects(getBytes(ref(client.storage, replacementPath)), (error) => error.code === "storage/unauthorized");

  const afterRemoval = await catchRepository.get(catchId, accountScope);
  const finalBytes = new Uint8Array([0xff, 0xd8, 0xff, 0x70]);
  await catchRepository.put({
    ...afterRemoval,
    updatedAt: new Date().toISOString(),
    photos: [{ id: "photo-3", name: "kapr-final.jpg", type: "image/jpeg", blob: new Blob([finalBytes], { type: "image/jpeg" }) }],
    sync: { ...afterRemoval.sync, revision: afterRemoval.sync.revision + 1 },
  }, accountScope);
  const beforeDelete = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(beforeDelete.status, "success", beforeDelete.error);
  const catchWithPhoto = await catchRepository.get(catchId, accountScope);
  const restoredPath = catchWithPhoto.photos[0].storagePath;

  await signOut(client.auth);
  const offlineLocal = await catchRepository.get(catchId, accountScope);
  assert.equal(offlineLocal.photos[0].blob.size, finalBytes.byteLength, "sign-out must preserve the local photo Blob");
  await signInWithEmailAndPassword(client.auth, email, password);
  assert.equal(client.auth.currentUser.uid, ownerId);
  await catchRepository.delete(catchId, accountScope);
  let failDeleteCleanup = true;
  const deleteCleanupInterrupted = {
    ...realPhotoStorage,
    deleteUnreferenced: async (args) => {
      if (failDeleteCleanup) {
        failDeleteCleanup = false;
        throw new SyncPortError("unavailable", "synthetic interrupted cleanup after Catch deletion");
      }
      return realPhotoStorage.deleteUnreferenced(args);
    },
  };
  const deletionInterrupted = await makeService(client, deleteCleanupInterrupted, () => Date.now() + 60_000).run(ownerId);
  assert.equal(deletionInterrupted.status, "error");
  assert.equal((await outboxRepository.list()).length, 1, "Catch deletion cleanup failure must remain queued after its own tombstone pull");
  const deleted = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(deleted.status, "success", deleted.error);
  assert.equal((await outboxRepository.list()).length, 0);
  assert.equal((await listAll(ref(client.storage, restoredPath.slice(0, restoredPath.lastIndexOf("/"))))).items.length, 0);
  await assert.rejects(getBytes(ref(client.storage, restoredPath)), (error) => error.code === "storage/unauthorized");
  assert.equal((await getDoc(doc(client.db, "users", ownerId, "catches", catchId))).data().deleted, true);

  await signOut(client.auth);
  const ownerlessId = `catch-ownerless-${crypto.randomUUID()}`;
  const ownerlessBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x7f])], { type: "image/jpeg" });
  const guestScope = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
  await catchRepository.put(makeCatch(ownerlessId, null, ownerlessBlob), guestScope);
  assert.equal((await catchRepository.get(ownerlessId, guestScope)).photos[0].blob.size, ownerlessBlob.size);
  await signInWithEmailAndPassword(client.auth, email, password);
  const afterOwnerless = await makeService(client, realPhotoStorage).run(ownerId);
  assert.equal(afterOwnerless.status, "success", afterOwnerless.error);
  assert.equal((await getDoc(doc(client.db, "users", ownerId, "catches", ownerlessId))).exists(), false);
  assert.equal((await outboxRepository.list()).some((item) => item.entityId === ownerlessId && item.ownerId === null), true);
  assert.equal((await catchRepository.get(ownerlessId, guestScope)).photos[0].blob.size, ownerlessBlob.size);

  const linked = await linkGuestData(ownerId, guestScope.scopeKey);
  assert.deepEqual(linked, { catches: 1, trips: 0, photos: 1 });
  const uploadedOwnerless = await makeService(client, realPhotoStorage, () => Date.now() + 60_000).run(ownerId);
  assert.equal(uploadedOwnerless.status, "success", uploadedOwnerless.error);
  const linkedRemote = await getDoc(doc(client.db, "users", ownerId, "catches", ownerlessId));
  assert.equal(linkedRemote.exists(), true);
  assert.equal(linkedRemote.data().ownerId, ownerId);
  const linkedPath = linkedRemote.data().photos[0].storagePath;
  assert.equal((await listAll(ref(client.storage, linkedPath.slice(0, linkedPath.lastIndexOf("/"))))).items.length, 1);

  await resetLocalDatabase();
  const linkedSecondDevice = await makeService(client, realPhotoStorage).run(ownerId);
  assert.equal(linkedSecondDevice.status, "success", linkedSecondDevice.error);
  const linkedRestored = await catchRepository.get(ownerlessId, accountScope);
  assert.equal(linkedRestored.ownerId, ownerId);
  assert.deepEqual([...new Uint8Array(await linkedRestored.photos[0].blob.arrayBuffer())], [0xff, 0xd8, 0xff, 0x7f]);
  assert.deepEqual([...new Uint8Array(await getBytes(ref(client.storage, linkedPath)))], [0xff, 0xd8, 0xff, 0x7f]);

  console.log("Photo sync Emulator passed: interrupted upload and all cleanup retries retain the outbox/local Blob, immutable private Storage objects have verified content, a second device restores photos, and explicit ownerless-data linking uploads then restores on a clean client. Cross-account denial is separately covered by test:rules.");
} finally {
  await Promise.all(apps.map((app) => deleteApp(app)));
}

process.exit(0);
