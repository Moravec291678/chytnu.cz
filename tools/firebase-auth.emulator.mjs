import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { applyActionCode, browserLocalPersistence, confirmPasswordReset, reload, verifyPasswordResetCode, connectAuthEmulator, createUserWithEmailAndPassword, GoogleAuthProvider, initializeAuth, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut } from "firebase/auth";
import "fake-indexeddb/auto";
import { catchRepository, getActiveGuestScopeKey, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createCatchRecord } from "../src/features/catches/data/catchModel.js";
import { accountScopeKey } from "../src/features/auth/data/localDataScope.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";

const projectId = "demo-chytnucz-local";
const email = `auth-emulator-${crypto.randomUUID()}@example.test`;
const password = "local-test-password-123";
const appName = `auth-test-${crypto.randomUUID()}`;
let app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, appName);
let auth = initializeAuth(app, { persistence: browserLocalPersistence });
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw new Error("Local Auth emulator required");
const localScope = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };

async function readEmulatorCode(requestType) {
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/oobCodes`);
  assert.equal(response.status, 200);
  const { oobCodes } = await response.json();
  const record = oobCodes.find((code) => code.email === email && code.requestType === requestType);
  assert.ok(record?.oobCode, `Missing emulator action for ${requestType}`);
  return record.oobCode;
}

async function snapshotLocalData() {
  return {
    catches: await catchRepository.list(localScope),
    trips: await tripRepository.list(localScope),
    outbox: await outboxRepository.list(),
  };
}

try {
  const localCatch = createCatchRecord({
    catchDate: new Date().toISOString().slice(0, 10),
    catchTime: "12:00",
    speciesKey: "carp",
    weightKg: "",
    lengthCm: "",
    girthCm: "",
    fightDurationMin: "",
    depthM: "",
    waterNumber: "",
    locationName: "",
    gpsLocation: "",
    bottomType: "",
    fishingMethod: "",
    baits: [],
    photos: [],
    notes: "synthetic auth isolation fixture",
    isFavorite: false,
    resultKey: "released",
  }, { key: "carp", label: "Kapr" }, []);
  await catchRepository.put(localCatch, localScope);
  const beforeAuth = await snapshotLocalData();

  const created = await createUserWithEmailAndPassword(auth, email, password);
  assert.equal(created.user.email, email);
  await sendEmailVerification(created.user);
  const verifyCode = await readEmulatorCode("VERIFY_EMAIL");
  await applyActionCode(auth, verifyCode);
  await reload(created.user);
  assert.equal(created.user.emailVerified, true);

  await signOut(auth);
  assert.equal(auth.currentUser, null);

  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.email, email);

  await assert.rejects(
    signInWithEmailAndPassword(auth, email, "wrong-password"),
    (error) => ["auth/invalid-credential", "auth/wrong-password"].includes(error.code),
  );

  await assert.rejects(signInWithEmailAndPassword(auth, `absent-${crypto.randomUUID()}@example.test`, password),
    (error) => ["auth/invalid-credential", "auth/user-not-found"].includes(error.code));

  await sendPasswordResetEmail(auth, email);
  const resetCode = await readEmulatorCode("PASSWORD_RESET");
  assert.equal(await verifyPasswordResetCode(auth, resetCode), email);
  const newPassword = "local-test-replacement-789";
  await confirmPasswordReset(auth, resetCode, newPassword);
  await assert.rejects(verifyPasswordResetCode(auth, resetCode), (error) => error.code === "auth/invalid-action-code");
  await signOut(auth);
  await assert.rejects(signInWithEmailAndPassword(auth, email, password),
    (error) => ["auth/invalid-credential", "auth/wrong-password"].includes(error.code));
  await signInWithEmailAndPassword(auth, email, newPassword);
  await deleteApp(app);
  app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, appName);
  auth = initializeAuth(app, { persistence: browserLocalPersistence });
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const restoredUser = await new Promise((resolve, reject) => {
    let unsubscribe;
    const timeout = setTimeout(() => reject(new Error("Auth session restore timed out.")), 5000);
    unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(currentUser);
    }, reject);
  });
  assert.equal(restoredUser?.email, email, "browser persistence must restore the signed-in user after client reinitialization");

  const ownerA = restoredUser.uid;
  const accountCatchId = crypto.randomUUID();
  const secondApp = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, `auth-two-${crypto.randomUUID()}`);
  try {
    const secondAuth = initializeAuth(secondApp, { persistence: browserLocalPersistence });
    connectAuthEmulator(secondAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    const { user: userB } = await createUserWithEmailAndPassword(secondAuth, `second-${crypto.randomUUID()}@example.test`, password);
    assert.notEqual(ownerA, userB.uid);
    const scopeA = { scopeKey: accountScopeKey(ownerA), ownerId: ownerA };
    const scopeB = { scopeKey: accountScopeKey(userB.uid), ownerId: userB.uid };
    await catchRepository.put({ ...localCatch, id: accountCatchId, ownerId: ownerA }, scopeA);
    assert.equal((await catchRepository.list(scopeA)).length, 1);
    assert.deepEqual(await catchRepository.list(scopeB), []);
    assert.deepEqual(await catchRepository.list(localScope), beforeAuth.catches);
    await signOut(secondAuth);
    assert.equal(secondAuth.currentUser, null);
    assert.equal(auth.currentUser.uid, ownerA, "standalone B session must not alter A");
  } finally {
    await deleteApp(secondApp);
  }

  await signOut(auth);
  const googleEmail = `google-emulator-${crypto.randomUUID()}@example.test`;
  const googleCredential = GoogleAuthProvider.credential(JSON.stringify({
    sub: `google-${crypto.randomUUID()}`, email: googleEmail, email_verified: true,
  }));
  const googleUser = await signInWithCredential(auth, googleCredential);
  assert.equal(googleUser.user.email, googleEmail);
  assert.equal(googleUser.user.providerData[0]?.providerId, "google.com");

  const offlineApp = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, `auth-offline-${crypto.randomUUID()}`);
  const offlineAuth = initializeAuth(offlineApp, { persistence: browserLocalPersistence });
  connectAuthEmulator(offlineAuth, "http://127.0.0.1:9098", { disableWarnings: true });
  await assert.rejects(
    signInWithEmailAndPassword(offlineAuth, email, password),
    (error) => error.code === "auth/network-request-failed",
  );
  await deleteApp(offlineApp);

  const afterAuth = await snapshotLocalData();
  const accountWrites = afterAuth.outbox.filter((operation) => operation.entityId === accountCatchId);
  assert.equal(accountWrites.length, 1);
  assert.equal(accountWrites[0].ownerId, ownerA);
  assert.deepEqual(
    { ...afterAuth, outbox: afterAuth.outbox.filter((operation) => operation.entityId !== accountCatchId) },
    beforeAuth,
    "auth actions must not alter the existing guest catches, trips, or outbox",
  );
  await signOut(auth);
  console.log("Auth Emulator passed: email registration, verified action and completed single-use reset, two isolated A/B sessions, Google credential flow, invalid/missing credentials, persistence, offline failure and local data isolation.");
} finally {
  await deleteApp(app);
}

// The Auth SDK leaves Node's HTTP keep-alive sockets open after deleteApp.
// This script is a standalone emulator test runner, so end the process after
// a successful assertion run; thrown failures still exit with a non-zero code.
process.exit(0);
