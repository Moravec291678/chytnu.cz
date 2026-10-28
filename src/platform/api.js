import { Capacitor } from "@capacitor/core";

const CONFIGURED_API_BASE = import.meta.env?.VITE_API_BASE_URL?.trim() ?? "";

export function resolveApiUrl(path, { native = Capacitor.isNativePlatform(), baseUrl = CONFIGURED_API_BASE } = {}) {
  if (typeof path !== "string" || !/^\/api\/[A-Za-z0-9/_-]+$/.test(path)) {
    throw new TypeError("Backend API cesta není platná.");
  }
  if (!baseUrl) {
    if (native) throw Object.assign(new Error("Pro nativní aplikaci je potřeba nastavit VITE_API_BASE_URL."), { code: "native_api_base_missing" });
    return path;
  }
  let base;
  try { base = new URL(baseUrl); } catch { throw Object.assign(new Error("VITE_API_BASE_URL musí být platná HTTPS adresa."), { code: "invalid_api_base" }); }
  if (!new Set(["https:", "http:"]).has(base.protocol)
    || (base.protocol !== "https:" && !new Set(["localhost", "127.0.0.1", "[::1]"]).has(base.hostname))) {
    throw Object.assign(new Error("VITE_API_BASE_URL musí používat HTTPS."), { code: "invalid_api_base" });
  }
  return new URL(path, base.origin).href;
}
