import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getActiveTripActivityAdapter, getLocationAdapter, getNotificationAdapter, getPlatformName, isNativePlatform } from "./index.js";

test("platform abstraction preserves browser APIs and provides explicit native extension points", async () => {
  assert.equal(getPlatformName(), "web");
  assert.equal(isNativePlatform(), false);
  const location = getLocationAdapter();
  assert.equal(location.platform, "web");
  assert.equal(typeof location.getCurrentPosition, "function");
  const notifications = getNotificationAdapter();
  assert.equal(notifications.platform, "web");
  assert.equal(typeof notifications.permission, "function");
  assert.equal(typeof notifications.subscribe, "function");
  const activity = getActiveTripActivityAdapter();
  assert.equal(activity.platform, "web");
  assert.equal(activity.supported, false);
  assert.equal(await activity.start({ id: "trip-1" }), false);
});

test("Capacitor uses the Vite build output and leaves the PWA service worker web-only", async () => {
  const [config, entry] = await Promise.all([
    readFile(new URL("../../capacitor.config.json", import.meta.url), "utf8"),
    readFile(new URL("../main.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(config, /"webDir":\s*"dist"/);
  assert.match(config, /"appId":\s*"cz\.chytnu\.app"/);
  assert.match(entry, /!Capacitor\.isNativePlatform\(\)\s*&&\s*"serviceWorker" in navigator/);
});
