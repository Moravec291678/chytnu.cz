import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeLabel } from "./runtimeDiagnostics.js";

test("runtime diagnostics distinguish iOS Home Screen, iOS browser, and standalone without exposing user agent", () => {
  assert.equal(getRuntimeLabel({ userAgent: "Mozilla/5.0 (iPhone)", standalone: true }), "iOS Home Screen");
  assert.equal(getRuntimeLabel({ userAgent: "Mozilla/5.0 (iPhone) Safari", standalone: false }), "iOS Safari");
  assert.equal(getRuntimeLabel({ userAgent: "Mozilla/5.0 (iPhone) CriOS", standalone: false }), "Browser");
  assert.equal(getRuntimeLabel({ userAgent: "Chrome", standalone: true }), "Standalone");
  assert.equal(getRuntimeLabel({ userAgent: "Firefox", standalone: false }), "Browser");
  assert.equal(getRuntimeLabel({ platform: "MacIntel", maxTouchPoints: 5, userAgent: "Safari" }), "iOS Safari");
});
