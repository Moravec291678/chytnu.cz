import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projectUrl = new URL("../", import.meta.url);

test("Vercel config builds Vite into dist and preserves SPA routes", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", projectUrl), "utf8"));
  assert.equal(config.framework, "vite");
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
  assert.ok(config.headers.some((entry) => entry.source === "/sw.js"
    && entry.headers.some((header) => header.key === "Cache-Control" && header.value.includes("max-age=0"))));
  const baselineHeaders = config.headers.find((entry) => entry.source === "/(.*)")?.headers ?? [];
  assert.ok(baselineHeaders.some((header) => header.key === "X-Content-Type-Options" && header.value === "nosniff"));
  assert.ok(baselineHeaders.some((header) => header.key === "Referrer-Policy" && header.value === "strict-origin-when-cross-origin"));
  assert.ok(baselineHeaders.some((header) => header.key === "Permissions-Policy" && header.value.includes("geolocation=(self)")));
});

test("environment example declares public client variables without server credentials", async () => {
  const content = await readFile(new URL(".env.example", projectUrl), "utf8");
  for (const variable of [
    "VITE_BACKEND_MODE",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_GOOGLE_AUTH_ENABLED",
  ]) assert.match(content, new RegExp(`^${variable}=`, "m"));
  assert.doesNotMatch(content, /PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN_CREDENTIAL/i);
});
