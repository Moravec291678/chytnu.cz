const NATIVE_ORIGINS = new Set(["https://localhost", "capacitor://localhost"]);
const ALLOWED_HEADERS = new Set(["authorization", "content-type"]);

// Origin controls browser access to responses. The handler still verifies Firebase.
export function withNativeApiCors(handler, method = "POST") {
  return function nativeApiHandler(req, res) {
    const { origin, host, "access-control-request-method": requestedMethod,
      "access-control-request-headers": requestedHeaders } = req.headers ?? {};
    const native = NATIVE_ORIGINS.has(origin);
    const sameOrigin = origin === `https://${host}`
      || (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host ?? "") && origin === `http://${host}`);
    const existingVary = res.getHeader?.("Vary");
    res.setHeader("Vary", [existingVary, "Origin"].filter(Boolean).join(", "));
    const preflight = req.method === "OPTIONS";
    const requestedNames = typeof requestedHeaders === "string"
      ? requestedHeaders.toLowerCase().split(",").map(name => name.trim()) : [];
    if (preflight || (origin && !native && !sameOrigin)) {
      res.setHeader("Cache-Control", "no-store");
      if (!preflight || !native || requestedMethod !== method || (requestedHeaders !== undefined
        && (typeof requestedHeaders !== "string" || requestedNames.some(name => !ALLOWED_HEADERS.has(name))))) {
        return res.status(403).json({ error: "cors_forbidden" });
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", method);
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      return res.status(204).end();
    }
    if (native) res.setHeader("Access-Control-Allow-Origin", origin);
    return handler(req, res);
  };
}
