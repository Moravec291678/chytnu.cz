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

test("generated service worker bypasses every non-GET request without cloning or replaying it", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /if \(request\.method !== 'GET' \|\| url\.origin !== self\.location\.origin\) return;/);
  assert.doesNotMatch(config, /event\.respondWith\(fetch\(event\.request\)\)/);
});

test("offline shell precaches all generated route and feature chunks, including lazy imports", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /const generated = Object\.values\(bundle\)\.map\(\(item\) => `\/\$\{item\.fileName\}`\);/);
  assert.match(config, /const files = \[[^\]]+\.\.\.generated\];/);
  assert.match(config, /cache\.addAll\(FILES\)/);
});

test("service worker keeps one prior shell for open tabs and only caches same-origin static assets", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /const previous = keys\.filter\(\(key\) => key\.startsWith\('chytnucz-shell-'\) && key !== CACHE\);/);
  assert.match(config, /const keep = previous\[previous\.length - 1\];/);
  assert.match(config, /previous\.filter\(\(key\) => key !== keep\)\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(config, /url\.pathname\.startsWith\('\/assets\/'\) \|\| \['\/favicon\.svg', '\/icons\.svg', '\/icon-192\.png', '\/icon-512\.png', '\/manifest\.webmanifest'\]/);
  assert.match(config, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(config, /url\.pathname\.startsWith\('\/api\//);
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
    "VITE_API_BASE_URL",
    "VITE_WEB_PUSH_PUBLIC_KEY",
    "VITE_FIREBASE_GOOGLE_AUTH_ENABLED",
  ]) assert.match(content, new RegExp(`^${variable}=`, "m"));
  assert.doesNotMatch(content, /PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN_CREDENTIAL/i);
});
