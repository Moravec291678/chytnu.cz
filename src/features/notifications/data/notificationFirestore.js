import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, setDoc, updateDoc,
} from "firebase/firestore";
import { firebaseAuth, getLocalFirebaseApp } from "../../auth/data/firebaseAuth.js";
import { getBackendConfiguration } from "../../auth/data/backendConfig.js";

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8080;
const EMULATOR_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");

function firestoreForNotifications() {
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

function requireCurrentOwner(ownerId) {
  if (!ownerId || firebaseAuth.currentUserId() !== ownerId) throw new Error("Přihlášený účet neodpovídá vlastníkovi oznámení.");
}

function notificationCollection(firestore, ownerId) {
  return collection(firestore, "users", ownerId, "notifications");
}

function serializeNotification(notification) {
  return {
    id: notification.id,
    ownerId: notification.ownerId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    deepLink: notification.deepLink,
  };
}

export const notificationFirestore = Object.freeze({
  async list(ownerId) {
    requireCurrentOwner(ownerId);
    const firestore = firestoreForNotifications();
    const result = await getDocs(query(notificationCollection(firestore, ownerId), orderBy("createdAt", "desc"), limit(250)));
    return result.docs.map((snapshot) => snapshot.data());
  },
  async get(ownerId, id) {
    requireCurrentOwner(ownerId);
    const snapshot = await getDoc(doc(firestoreForNotifications(), "users", ownerId, "notifications", id));
    return snapshot.exists() ? snapshot.data() : null;
  },
  async create(notification) {
    requireCurrentOwner(notification.ownerId);
    const reference = doc(firestoreForNotifications(), "users", notification.ownerId, "notifications", notification.id);
    const record = serializeNotification(notification);
    const readAt = record.readAt;
    await setDoc(reference, { ...record, readAt: null });
    if (readAt) await updateDoc(reference, { readAt });
  },
  async markRead(ownerId, id, readAt) {
    requireCurrentOwner(ownerId);
    await updateDoc(doc(firestoreForNotifications(), "users", ownerId, "notifications", id), { readAt });
  },
});
