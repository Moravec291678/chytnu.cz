import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  createUserWithEmailAndPassword,
  initializeAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator,
} from "firebase/auth";

const APP_NAME = "chytnucz-local-auth-emulator";
const PROJECT_ID = "demo-chytnucz-local";
const EMULATOR_URL = "http://127.0.0.1:9099";
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

let authInstance;
let authConfigurationError;
const EMULATOR_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");

function connectedEmulators() {
  globalThis[EMULATOR_CONNECTIONS] ??= new Set();
  return globalThis[EMULATOR_CONNECTIONS];
}

function canUseLocalEmulator() {
  return Boolean(import.meta.env?.DEV)
    && typeof window !== "undefined"
    && ALLOWED_HOSTS.has(window.location.hostname);
}

export function getLocalFirebaseApp() {
  if (authConfigurationError) throw authConfigurationError;
  if (!canUseLocalEmulator()) {
    authConfigurationError = Object.assign(
      new Error("Lokální emulátor účtů není v tomto prostředí povolen."),
      { code: "auth/emulator-config-required" },
    );
    throw authConfigurationError;
  }

  try {
    const existingApp = getApps().find((app) => app.name === APP_NAME);
    return existingApp ?? initializeApp({
      apiKey: "demo-api-key",
      authDomain: "localhost",
      projectId: PROJECT_ID,
      storageBucket: `${PROJECT_ID}.appspot.com`,
    }, APP_NAME);
  } catch (error) {
    authConfigurationError = error;
    throw error;
  }
}

function getAuthInstance() {
  if (authInstance) return authInstance;
  const app = getLocalFirebaseApp();
  try {
    let auth;
    try {
      auth = initializeAuth(app, { persistence: browserLocalPersistence });
    } catch (error) {
      if (error?.code !== "auth/already-initialized") throw error;
      auth = getAuth(app);
    }
    if (!connectedEmulators().has(`auth:${APP_NAME}`)) {
      connectAuthEmulator(auth, EMULATOR_URL, { disableWarnings: true });
      connectedEmulators().add(`auth:${APP_NAME}`);
    }
    authInstance = auth;
    return authInstance;
  } catch (error) {
    authConfigurationError = error;
    throw error;
  }
}

export const firebaseAuth = {
  currentUserId() {
    return getAuthInstance().currentUser?.uid ?? null;
  },
  observe(listener, onError) {
    try {
      return onAuthStateChanged(getAuthInstance(), listener, onError);
    } catch (error) {
      onError?.(error);
      return () => {};
    }
  },
  async register(email, password) {
    const credential = await createUserWithEmailAndPassword(getAuthInstance(), email.trim(), password);
    let verificationEmailSent = false;
    try {
      await sendEmailVerification(credential.user);
      verificationEmailSent = true;
    } catch {
      // Account creation has already succeeded; verification can be requested again.
    }
    return { user: credential.user, verificationEmailSent };
  },
  async signIn(email, password) {
    const credential = await signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
    return credential.user;
  },
  signOut() {
    return signOut(getAuthInstance());
  },
  async resetPassword(email) {
    try {
      await sendPasswordResetEmail(getAuthInstance(), email.trim());
    } catch (error) {
      if (error?.code === "auth/user-not-found") return;
      throw error;
    }
  },
  async resendVerification(user) {
    await sendEmailVerification(user);
  },
};
