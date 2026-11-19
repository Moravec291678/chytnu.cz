import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Privacy settings expose a scoped default for new Catch records", async () => {
  const source = await readFile(new URL("./PrivacyPage.jsx", import.meta.url), "utf8");
  assert.match(source, /Výchozí viditelnost nových úlovků/);
  assert.match(source, /defaultCatchVisibility: visibility, defaultCatchVisibilityExplicit: true/);
  assert.match(source, /Platí pro nové úlovky\. Již uložené záznamy se nezmění/);
  assert.match(source, /Na novém zařízení zkontroluj předvolbu znovu/);
  assert.doesNotMatch(source, /save\(\{ profileVisibility:/);
});

test("privacy page sends profile visibility changes to the authoritative account settings", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
  try {
    const { ProfileSharingSettingsLink } = await server.ssrLoadModule("/src/pages/PrivacyPage.jsx");
    const { StaticRouter } = await server.ssrLoadModule("react-router");
    const html = renderToStaticMarkup(React.createElement(StaticRouter, {}, React.createElement(ProfileSharingSettingsLink)));
    assert.match(html, /href="\/profile\/social"/);
    assert.match(html, /Rybářský profil a online sdílení/);
    assert.match(html, /Změnu potvrdí server/);
    assert.doesNotMatch(html, /<input|role="switch"|zatím nejsou aktivní/);
  } finally { await server.close(); }
});
