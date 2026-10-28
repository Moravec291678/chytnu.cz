import { isNativePlatform } from "../platform.js";

// No background/native activity is started yet; this adapter keeps Trip UI independent of a future platform plugin.
export function getActiveTripActivityAdapter() {
  return Object.freeze({
    platform: isNativePlatform() ? "native" : "web",
    supported: false,
    async start() { return false; },
    async update() { return false; },
    async stop() { return false; },
  });
}
