// Local demo-only regression: Vite restarts must not delete the new Firebase
// Admin app or turn a valid authenticated browser session into a 401.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const allowed = new Set(["path", "systemroot", "windir", "temp", "tmp", "userprofile", "home", "appdata", "localappdata", "comspec", "pathext"]);
for (const key of Object.keys(process.env)) if (!allowed.has(key.toLowerCase())) delete process.env[key];
Object.assign(process.env, {
  CHYTNU_LOCAL_SOCIAL_API: "1", VITE_BACKEND_MODE: "emulator", GCLOUD_PROJECT: "demo-chytnucz-local",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", METADATA_SERVER_DETECTION: "none",
});
const { createServer } = await import("vite");
let server, token, checks = 0;
const authUrl = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:";
async function authAction(action, body) {
  return fetch(`${authUrl}${action}?key=demo-api-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function self(expected, bearer = token) {
  const response = await fetch("http://127.0.0.1:5180/api/social", {
    method: "POST", headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify({ action: "self" }),
  });
  assert.equal(response.status, expected); checks++;
  if (expected === 200) assert.equal(typeof (await response.json()).uid, "string");
}
try {
  const signup = await authAction("signUp", { email: `hmr-${randomUUID()}@example.test`, password: "Synthetic-emulator-only-2026!", returnSecureToken: true });
  assert.equal(signup.status, 200); checks++; token = (await signup.json()).idToken;
  server = await createServer({ server: { host: "127.0.0.1", port: 5180, strictPort: true }, logLevel: "error" });
  await server.listen();
  await self(200);
  for (let index = 0; index < 3; index++) { await server.restart(); await self(200); }
  await self(401, "invalid-emulator-token");
  await self(401, null);
  console.log(`Local real-handler HMR: ${checks} checks PASS (3 restarts, valid session retained, invalid/anonymous denied).`);
} finally {
  await server?.close();
  if (token) assert.equal((await authAction("delete", { idToken: token })).status, 200);
}
