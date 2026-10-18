const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REQUIRED_FIREBASE_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

function configurationError(message) {
  return Object.assign(new Error(message), { code: "auth/backend-config-required" });
}

export function resolveBackendConfiguration(env = {}, hostname = "") {
  const implicitLocalEmulator = !env.VITE_BACKEND_MODE && env.DEV && LOCAL_HOSTS.has(hostname);
  const mode = env.VITE_BACKEND_MODE || (implicitLocalEmulator ? "emulator" : "");
  if (!new Set(["emulator", "staging", "production"]).has(mode)) {
    throw configurationError("Není zvolený platný režim backendu.");
  }
  if (mode === "emulator") {
    if (!LOCAL_HOSTS.has(hostname)) throw configurationError("Lokální emulátor lze použít pouze na tomto zařízení.");
    return {
      mode,
      googleAuthEnabled: true,
      firebase: {
        apiKey: "demo-api-key", authDomain: "localhost", projectId: "demo-chytnucz-local",
        storageBucket: "demo-chytnucz-local.appspot.com",
      },
    };
  }
  const missing = REQUIRED_FIREBASE_KEYS.filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) throw configurationError(`Pro režim ${mode} chybí Firebase konfigurace.`);
  return {
    mode,
    googleAuthEnabled: env.VITE_FIREBASE_GOOGLE_AUTH_ENABLED === "true",
    firebase: {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    },
  };
}

export function getBackendConfiguration() {
  return resolveBackendConfiguration(import.meta.env, typeof window === "undefined" ? "" : window.location.hostname);
}

export function readBackendCapabilities() {
  try {
    const config = getBackendConfiguration();
    return { mode: config.mode, configured: true, googleAuthEnabled: config.googleAuthEnabled };
  } catch {
    return { mode: import.meta.env?.VITE_BACKEND_MODE || "unconfigured", configured: false, googleAuthEnabled: false };
  }
}
