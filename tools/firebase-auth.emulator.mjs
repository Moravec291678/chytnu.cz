import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, createUserWithEmailAndPassword, GoogleAuthProvider, initializeAuth, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut } from "firebase/auth";
import "fake-indexeddb/auto";
import { catchRepository, getActiveGuestScopeKey, outboxRepository } from "../src/features/catches/data/catchRepository.js";
import { createCatchRecord } from "../src/features/catches/data/catchModel.js";
import { tripRepository } from "../src/features/trips/data/tripRepository.js";

const projectId = "demo-chytnucz-local";
const email = `auth-emulator-${crypto.randomUUID()}@example.test`;
const password = "local-test-password-123";
const appName = `auth-test-${crypto.randomUUID()}`;
let app = initializeApp({ apiKey: "demo-api-key", authDomain: "localhost", projectId }, appName);
let auth = initializeAuth(app, { persistence: browserLocalPersistence });
connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const localScope = { scopeKey: await getActiveGuestScopeKey(), ownerId: null };

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

  await signOut(auth);
  assert.equal(auth.currentUser, null);

  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.email, email);

  await assert.rejects(
    signInWithEmailAndPassword(auth, email, "wrong-password"),
    (error) => ["auth/invalid-credential", "auth/wrong-password"].includes(error.code),
  );

  await sendPasswordResetEmail(auth, email);
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
  assert.deepEqual(afterAuth, beforeAuth, "auth actions must not alter local catches, trips, or outbox");
  await signOut(auth);
  console.log("Auth Emulator passed: email registration/login/verification/reset, Google credential flow, invalid credentials, session restoration, sign-out, unavailable-emulator error, and local data isolation.");
} finally {
  await deleteApp(app);
}

// The Auth SDK leaves Node's HTTP keep-alive sockets open after deleteApp.
// This script is a standalone emulator test runner, so end the process after
// a successful assertion run; thrown failures still exit with a non-zero code.
process.exit(0);
