import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "./api.js";

test("web backend routes remain relative unless an explicit API origin is configured", () => {
  assert.equal(resolveApiUrl("/api/cloudinary/sign", { native: false }), "/api/cloudinary/sign");
  assert.equal(resolveApiUrl("/api/cloudinary/sign", { native: false, baseUrl: "https://chytnu.example/" }), "https://chytnu.example/api/cloudinary/sign");
});

test("native backend routes require an HTTPS API origin and reject unsafe paths", () => {
  assert.throws(() => resolveApiUrl("/api/cloudinary/sign", { native: true }), { code: "native_api_base_missing" });
  assert.equal(resolveApiUrl("/api/cloudinary/sign", { native: true, baseUrl: "https://chytnu.example" }), "https://chytnu.example/api/cloudinary/sign");
  assert.throws(() => resolveApiUrl("/api/cloudinary/sign", { native: true, baseUrl: "http://chytnu.example" }), { code: "invalid_api_base" });
  assert.throws(() => resolveApiUrl("https://attacker.example/api/cloudinary/sign", { native: false }), /cesta není platná/);
});
