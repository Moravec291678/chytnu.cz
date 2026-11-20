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

test("Capacitor declares foreground location and camera purposes for existing capture flows", async () => {
  const [android, ios] = await Promise.all([
    readFile(new URL("../../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
    readFile(new URL("../../ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);
  assert.match(android, /<uses-permission android:name="android\.permission\.ACCESS_COARSE_LOCATION"\s*\/>/);
  assert.match(android, /<uses-permission android:name="android\.permission\.ACCESS_FINE_LOCATION"\s*\/>/);
  assert.doesNotMatch(android, /ACCESS_BACKGROUND_LOCATION/);
  assert.match(ios, /<key>NSCameraUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(ios, /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.doesNotMatch(ios, /NSLocationAlways|<key>UIBackgroundModes<\/key>/);
});
