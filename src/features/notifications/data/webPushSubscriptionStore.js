import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocs, getFirestore, query, setDoc,
} from "firebase/firestore";
import { firebaseAuth, getLocalFirebaseApp } from "../../auth/data/firebaseAuth.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";

const EMULATOR_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;
const INSTALLATION_ID_KEY = "chytnucz.webPush.installationId.v1";

function firestoreForSubscriptions() {
  const app = getLocalFirebaseApp();
  const firestore = getFirestore(app);
  globalThis[EMULATOR_CONNECTIONS] ??= new Set();
  const key = `firestore:${app.name}`;
  if (getBackendConfiguration().mode === "emulator" && !globalThis[EMULATOR_CONNECTIONS].has(key)) {
    connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORT);
    globalThis[EMULATOR_CONNECTIONS].add(key);
  }
  return firestore;
}

function requireOwner(ownerId) {
  if (!ownerId || firebaseAuth.currentUserId() !== ownerId) throw new Error("Přihlášený účet neodpovídá vlastníkovi push oznámení.");
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function collectionFor(firestore, ownerId) {
  return collection(firestore, "users", ownerId, "pushSubscriptions");
}

function isValidEndpoint(value) {
  if (typeof value !== "string" || value.length > 1900) return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password;
  } catch { return false; }
}

function installationId() {
  let id = globalThis.localStorage?.getItem(INSTALLATION_ID_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.();
    if (!id) throw new Error("Toto zařízení nemůže bezpečně identifikovat push registraci.");
    globalThis.localStorage?.setItem(INSTALLATION_ID_KEY, id);
  }
  return id;
}

export const webPushSubscriptionStore = Object.freeze({
  async save(ownerId, raw) {
    requireOwner(ownerId);
    const endpoint = raw?.endpoint;
    const p256dh = raw?.keys?.p256dh;
    const auth = raw?.keys?.auth;
    if (!isValidEndpoint(endpoint)
      || typeof p256dh !== "string" || p256dh.length > 256
      || typeof auth !== "string" || auth.length > 256) throw new TypeError("Push subscription není platná.");
    const firestore = firestoreForSubscriptions();
    const subscriptions = collectionFor(firestore, ownerId);
    const deviceId = installationId();
    const existing = await getDocs(query(subscriptions));
    const previousForThisInstallation = existing.docs.filter((item) => item.data().ownerId === ownerId
      && item.data().installationId === deviceId && item.data().endpoint !== endpoint);
    await Promise.all(previousForThisInstallation.map((item) => deleteDoc(item.ref)));
    const reference = doc(subscriptions, await subscriptionId(endpoint));
    const now = new Date().toISOString();
    await setDoc(reference, {
      ownerId,
      installationId: deviceId,
      endpoint,
      expirationTime: Number.isFinite(raw.expirationTime) ? raw.expirationTime : null,
      keys: { p256dh, auth },
      updatedAt: now,
    }, { merge: true });
  },
  async remove(ownerId, endpoint) {
    requireOwner(ownerId);
    if (!isValidEndpoint(endpoint)) return false;
    const firestore = firestoreForSubscriptions();
    await deleteDoc(doc(collectionFor(firestore, ownerId), await subscriptionId(endpoint)));
    return true;
  },
  async removeInvalid(ownerId, endpoint) {
    return webPushSubscriptionStore.remove(ownerId, endpoint);
  },
  async removeExpired(ownerId, now = Date.now()) {
    requireOwner(ownerId);
    const firestore = firestoreForSubscriptions();
    const snapshot = await getDocs(query(collectionFor(firestore, ownerId)));
    const expired = snapshot.docs.filter((item) => {
      const value = item.data();
      return value.ownerId === ownerId && typeof value.endpoint === "string"
        && (typeof value.expirationTime === "number" && value.expirationTime > 0 && value.expirationTime <= now);
    });
    await Promise.all(expired.map((item) => deleteDoc(item.ref)));
    return expired.length;
  },
});
