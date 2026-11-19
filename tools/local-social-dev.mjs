import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const allowedEnvironment = new Set([
  "path", "systemroot", "windir", "temp", "tmp", "userprofile", "home",
  "appdata", "localappdata", "comspec", "pathext",
]);

function emulatorAvailable(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const finish = (available) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function localEnvironment() {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => allowedEnvironment.has(key.toLowerCase())));
  env.CHYTNU_LOCAL_SOCIAL_API = "1";
  env.VITE_BACKEND_MODE = "emulator";
  env.GCLOUD_PROJECT = "demo-chytnucz-local";
  env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  return env;
}

async function main() {
  for (const port of [9099, 8080]) {
    if (!await emulatorAvailable(port)) {
      throw new Error(`Firebase emulátor na 127.0.0.1:${port} neběží. Nejprve spusť npm run emulators.`);
    }
  }

  const child = spawn(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
    cwd: projectRoot,
    env: localEnvironment(),
    stdio: "inherit",
  });
  const stop = () => {
    if (!child.killed) child.kill();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  child.once("error", (error) => {
    console.error(`Lokální Vite server se nepodařilo spustit: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
