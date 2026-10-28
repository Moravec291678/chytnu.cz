import { isNativePlatform } from "../platform.js";

function browserGeolocation() {
  return globalThis.navigator?.geolocation ?? null;
}

export function getLocationAdapter() {
  const geolocation = browserGeolocation();
  return Object.freeze({
    platform: isNativePlatform() ? "native-webview" : "web",
    supported: Boolean(geolocation),
    getCurrentPosition(options = {}) {
      if (!geolocation) return Promise.reject(new Error("Poloha není na tomto zařízení dostupná."));
      return new Promise((resolve, reject) => geolocation.getCurrentPosition(resolve, reject, options));
    },
    watchPosition(onPosition, onError, options = {}) {
      if (!geolocation) throw new Error("Sledování polohy není na tomto zařízení dostupné.");
      return geolocation.watchPosition(onPosition, onError, options);
    },
    clearWatch(watchId) {
      geolocation?.clearWatch(watchId);
    },
  });
}
