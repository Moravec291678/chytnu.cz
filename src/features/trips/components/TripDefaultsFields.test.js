import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("Trip preparation keeps advanced defaults optional and renders editable known values including zero", async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: Fields } = await server.ssrLoadModule("/src/features/trips/components/TripDefaultsFields.jsx");
    const { DataScopeContext } = await server.ssrLoadModule("/src/features/auth/context/dataScopeContextValue.js");
    const render = values => renderToStaticMarkup(React.createElement(DataScopeContext.Provider,
      { value: { status: "ready", scopeKey: "guest", ownerId: null } }, React.createElement(Fields, { values, onChange() {} })));
    const empty = render({});
    assert.match(empty, /<summary>Výchozí údaje pro rychlé úlovky<\/summary>/);
    assert.doesNotMatch(empty, /<details[^>]*\bopen\b|\brequired=""/);
    assert.match(empty, /Neuvedena/);
    const defaults = render({ methodKey: "feeder", baitKeys: ["corn"], waterDepthM: 0, bottomType: "gravel", waterTempC: 0, waterTempMeasuredAt: "2026-11-08T09:00:00" });
    assert.match(defaults, /value="feeder" selected=""/);
    assert.match(defaults, /value="gravel" selected=""/);
    assert.equal((defaults.match(/value="0"/g) ?? []).length, 2);
    assert.match(defaults, /type="datetime-local"[^>]*required=""[^>]*value="2026-11-08T09:00:00"/);
    assert.match(defaults, /Dřívější úlovky si zachovají původní údaje/);
    assert.match(defaults, /nejde o nové měření při každé fotografii/);
  } finally { await server.close(); }
});
