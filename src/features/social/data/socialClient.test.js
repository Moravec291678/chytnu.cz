import assert from "node:assert/strict";
import { test } from "node:test";
import { socialRequest } from "./socialClient.js";
test("offline discovery performs no network request and keeps a Czech error", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator"), oldFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: false } });
  let called = false; globalThis.fetch = async () => { called = true; };
  try { await assert.rejects(() => socialRequest("search", { query: "rybar" }), /připojení.*offline/); assert.equal(called, false); }
  finally { globalThis.fetch = oldFetch; if (previous) Object.defineProperty(globalThis, "navigator", previous); else delete globalThis.navigator; }
});
test("network and invalid JSON responses become safe Czech loading errors", async () => {
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch raw provider detail"); };
    await assert.rejects(() => socialRequest("search", { query: "rybar" }), /Připojení k veřejným profilům není dostupné/);
    globalThis.fetch = async () => new Response("<html>bad gateway</html>", { status: 502 });
    await assert.rejects(() => socialRequest("search", { query: "rybar" }), /Připojení k veřejným profilům není dostupné/);
  } finally { globalThis.fetch = oldFetch; }
});
