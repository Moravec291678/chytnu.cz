import { getBackendConfiguration, readBackendCapabilities } from "./backendConfig.js";

const EMULATOR_URL = "http://127.0.0.1:9099";
const EMULATOR_CONNECTIONS = Symbol.for("chytnucz.firebaseEmulatorConnections");

let authInstance;
let authConfigurationError;
let firebaseAppApi;
let firebaseAuthApi;
let firebaseModulesPromise;

function reportAuthFailure(operation, error) {
  let mode = "unknown";
  try { mode = getBackendConfiguration().mode; } catch { /* Configuration errors are reported by the caller. */ }
  if (!["emulator", "staging"].includes(mode)) return;
  const code = typeof error?.code === "string" ? error.code : "auth/unknown";
  console.error(`[ChytnuCz auth] ${operation}: ${code}`);
}

function connectedEmulators() {
  globalThis[EMULATOR_CONNECTIONS] ??= new Set();
  return globalThis[EMULATOR_CONNECTIONS];
}

async function loadFirebaseModules() {
  firebaseModulesPromise ??= Promise.all([import("firebase/app"), import("firebase/auth")]).then(([appApi, authApi]) => {
    firebaseAppApi = appApi;
    firebaseAuthApi = authApi;
    return { appApi, authApi };
  });
  return firebaseModulesPromise;
}

export function getLocalFirebaseApp() {
  if (authConfigurationError) throw authConfigurationError;
  if (!firebaseAppApi) {
    throw Object.assign(new Error("Firebase SDK ještě není připravené."), { code: "auth/backend-config-required" });
  }
  try {
    const config = getBackendConfiguration();
    const appName = `chytnucz-${config.mode}-${config.firebase.projectId}`;
    const existingApp = firebaseAppApi.getApps().find((app) => app.name === appName);
    return existingApp ?? firebaseAppApi.initializeApp(config.firebase, appName);
  } catch (error) {
    authConfigurationError = error;
    throw error;
  }
}

async function getAuthInstance() {
  if (authInstance) return authInstance;
  await loadFirebaseModules();
  const app = getLocalFirebaseApp();
  try {
    const auth = initializeBrowserAuth(app, firebaseAuthApi);
    const config = getBackendConfiguration();
    if (config.mode === "emulator" && !connectedEmulators().has(`auth:${app.name}`)) {
      firebaseAuthApi.connectAuthEmulator(auth, EMULATOR_URL, { disableWarnings: true });
      connectedEmulators().add(`auth:${app.name}`);
    }
    authInstance = auth;
    return authInstance;
  } catch (error) {
    authConfigurationError = error;
    throw error;
  }
}

export function initializeBrowserAuth(app, authApi) {
  try {
    return authApi.initializeAuth(app, {
      persistence: authApi.browserLocalPersistence,
      popupRedirectResolver: authApi.browserPopupRedirectResolver,
    });
  } catch (error) {
    if (error?.code !== "auth/already-initialized") throw error;
    return authApi.getAuth(app);
  }
}

export async function getFirebaseIdToken(auth, forceRefresh = false) {
  if (!auth?.currentUser) return null;
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function runGoogleSignIn(auth, authApi) {
  const provider = new authApi.GoogleAuthProvider();
  try {
    const credential = await authApi.signInWithPopup(auth, provider);
    return credential.user;
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      await authApi.signInWithRedirect(auth, provider);
      return null;
    }
    throw error;
  }
}

export const firebaseAuth = {
  capabilities: readBackendCapabilities,
  currentUserId() {
    return authInstance?.currentUser?.uid ?? null;
  },
  async currentIdToken(forceRefresh = false) {
    const auth = await getAuthInstance();
    return getFirebaseIdToken(auth, forceRefresh);
  },
  observe(listener, onError) {
    let active = true;
    let unsubscribe = () => {};
    getAuthInstance().then((auth) => {
      if (!active) return;
      unsubscribe = firebaseAuthApi.onAuthStateChanged(auth, listener, onError);
      firebaseAuthApi.getRedirectResult(auth).catch((error) => {
        if (!active) return;
        reportAuthFailure("redirect-result", error);
        onError?.(error);
      });
    }).catch((error) => onError?.(error));
    return () => {
      active = false;
      unsubscribe();
    };
  },
  async register(email, password) {
    const auth = await getAuthInstance();
    const credential = await firebaseAuthApi.createUserWithEmailAndPassword(auth, email.trim(), password);
    let verificationEmailSent = false;
    try {
      await firebaseAuthApi.sendEmailVerification(credential.user);
      verificationEmailSent = true;
    } catch {
      // Account creation succeeded; verification can be requested again later.
    }
    return { user: credential.user, verificationEmailSent };
  },
  async signIn(email, password, { remember = true } = {}) {
    const auth = await getAuthInstance();
    await firebaseAuthApi.setPersistence(auth, remember ? firebaseAuthApi.browserLocalPersistence : firebaseAuthApi.browserSessionPersistence);
    const credential = await firebaseAuthApi.signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  },
  async signInWithGoogle() {
    const config = getBackendConfiguration();
    if (!config.googleAuthEnabled) {
      throw Object.assign(new Error("Google přihlášení není v tomto prostředí zapnuté."), { code: "auth/provider-disabled" });
    }
    const auth = await getAuthInstance();
    try {
      return await runGoogleSignIn(auth, firebaseAuthApi);
    } catch (error) {
      reportAuthFailure("google-sign-in", error);
      throw error;
    }
  },
  async signOut() {
    const auth = await getAuthInstance();
    return firebaseAuthApi.signOut(auth);
  },
  async resetPassword(email) {
    try {
      const auth = await getAuthInstance();
      await firebaseAuthApi.sendPasswordResetEmail(auth, email.trim());
    } catch (error) {
      if (error?.code === "auth/user-not-found") return;
      throw error;
    }
  },
  async resendVerification(user) {
    await loadFirebaseModules();
    await firebaseAuthApi.sendEmailVerification(user);
  },
};
