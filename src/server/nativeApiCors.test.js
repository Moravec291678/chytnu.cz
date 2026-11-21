import assert from "node:assert/strict";
import test from "node:test";
import config from "../../capacitor.config.json" with { type: "json" };
import capability from "../../api/cloudinary/capability.js";
import sign from "../../api/cloudinary/sign.js";
import verify from "../../api/cloudinary/verify-upload.js";
import delivery from "../../api/cloudinary/delivery.js";
import metadata from "../../api/cloudinary/metadata.js";
import exportPhoto from "../../api/cloudinary/export.js";
import deletePhoto from "../../api/cloudinary/delete.js";
import deleteAccount from "../../api/account/delete.js";
import { withNativeApiCors } from "./nativeApiCors.js";

const origins = [`${config.server.androidScheme}://${config.server.hostname}`, `${config.server.iosScheme}://${config.server.hostname}`];
async function request(handler, { method = "OPTIONS", origin, host = "chytnu-cz.vercel.app", requestedMethod = "POST", requestedHeaders = "authorization, content-type" } = {}) {
  const res = { headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    end() {}, json(value) { this.body = value; },
  };
  await handler({ method, headers: { origin, host, "access-control-request-method": requestedMethod, "access-control-request-headers": requestedHeaders } }, res);
  return res;
}

test("actual Vercel route handlers accept the matching native preflight before configuration or Firebase", async () => {
  for (const origin of origins) {
    for (const handler of [sign, verify, delivery, metadata, exportPhoto, deletePhoto, deleteAccount, capability]) {
      const requestedMethod = handler === capability ? "GET" : "POST";
      const res = await request(handler, { origin, requestedMethod });
      assert.equal(res.statusCode, 204);
      assert.equal(res.headers["access-control-allow-origin"], origin);
      assert.equal(res.headers["access-control-allow-methods"], requestedMethod);
      assert.equal(res.headers["access-control-allow-headers"], "Authorization, Content-Type");
      assert.equal(res.headers["access-control-allow-credentials"], undefined);
      assert.match(res.headers.vary, /\bOrigin\b/);
      assert.equal(res.body, undefined);
    }
  }
});

test("arbitrary origins, wrong methods and unapproved headers never reach the handler", async () => {
  let reached = 0;
  const endpoint = withNativeApiCors(() => reached++);
  for (const params of [
    { origin: "null" }, { origin: "https://localhost.evil.example" }, { origin: "http://localhost" },
    { origin: "https://foreign.example", method: "POST" },
    { origin: origins[0], requestedMethod: "DELETE" }, { origin: origins[1], requestedHeaders: "Authorization, X-Injected" },
    { origin: "https://localhost:9000" }, { origin: "capacitor://other" },
  ]) {
    const res = await request(endpoint, params);
    assert.equal(res.statusCode, 403);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  }
  assert.equal(reached, 0);
});

test("same-origin production, protected preview and local web clients still reach the handler", async () => {
  const endpoint = withNativeApiCors((_req, res) => res.status(401).json({ error: "missing_auth" }));
  for (const [origin, host] of [[undefined, "chytnu-cz.vercel.app"], ["https://chytnu-cz.vercel.app", "chytnu-cz.vercel.app"],
    ["https://preview.vercel.app", "preview.vercel.app"], ["http://127.0.0.1:5173", "127.0.0.1:5173"]]) {
    const res = await request(endpoint, { method: "POST", origin, host });
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["access-control-allow-origin"], undefined);
  }
});
