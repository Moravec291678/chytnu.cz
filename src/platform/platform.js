import { Capacitor } from "@capacitor/core";

export function getPlatformName() {
  return Capacitor.getPlatform();
}

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export function getPlatformRuntime() {
  return Object.freeze({ name: getPlatformName(), native: isNativePlatform() });
}
