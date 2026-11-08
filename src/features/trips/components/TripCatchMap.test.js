import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("Trip map renders four owner-scoped catch links before optional tiles load, including unknown fish", async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: Map } = await server.ssrLoadModule("/src/features/trips/components/TripCatchMap.jsx");
    const { DataScopeContext } = await server.ssrLoadModule("/src/features/auth/context/dataScopeContextValue.js");
    const { StaticRouter } = await server.ssrLoadModule("react-router-dom/server");
    const scope = { ownerId: "map-owner", scopeKey: "account:map-owner" };
    const trip = { ...scope, id: "trip" };
    const catches = Array.from({ length: 4 }, (_, i) => ({ ...scope, id: `catch-${i}`, tripId: trip.id,
      coordinates: { latitude: 50 + i * .004, longitude: 14 + i * .001 }, caughtAt: "2026-11-08T09:00:00Z" }));
    const render = data => renderToString(React.createElement(StaticRouter, { location: "/" }, React.createElement(DataScopeContext.Provider, { value: scope }, React.createElement(Map, data))));
    const html = render({ trip, catches });
    assert.match(html, /Mapa vycházky/);
    for (let i = 0; i < 4; i++) assert.match(html, new RegExp(`href="/catch/catch-${i}"`));
    assert.match(html, /Druh zatím neurčen/);
    assert.doesNotMatch(render({ trip: { ...trip, ownerId: "other" }, catches }), /href="\/catch\//);
    assert.match(render({ trip, catches: [] }), /Zatím tu nejsou úlovky/);
  } finally { await server.close(); }
});
