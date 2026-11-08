import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("Home analysis first render is safe before async cache loading for guests and signed-in diaries", async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: Card } = await server.ssrLoadModule("/src/features/home/components/HomeInsightCard.jsx");
    const { DataScopeContext } = await server.ssrLoadModule("/src/features/auth/context/dataScopeContextValue.js");
    const { StaticRouter } = await server.ssrLoadModule("react-router-dom/server");
    const { default: Boundary } = await server.ssrLoadModule("/src/features/home/components/HomeInsightBoundary.jsx");
    const fixtures = [[], [{ id: "legacy", caughtAt: "2026-10-01T10:00:00Z", speciesKey: "commonCarp", lengthCm: 50 }],
      [{ id: "quick", caughtAt: "2026-10-01T10:00:00Z", captureMode: "quick", aiRecognition: { status: "waiting_internet" } }]];
    for (const ownerId of [null, "synthetic-owner"]) {
      for (const catches of fixtures) {
        const scope = { scopeKey: ownerId ? `account:${ownerId}` : "guest", ownerId };
        const html = renderToString(React.createElement(StaticRouter, { location: "/" },
          React.createElement(DataScopeContext.Provider, { value: scope }, React.createElement(Card, { catches, trips: [] }))));
        assert.match(html, /home-insight-title/);
        assert.doesNotMatch(html, /Aplikaci se nepodařilo zobrazit/);
      }
    }
    const boundary = new Boundary({ children: "diary sibling unaffected" });
    assert.equal(boundary.render(), "diary sibling unaffected");
    boundary.state = Boundary.getDerivedStateFromError(new Error("optional analysis failed"));
    const fallback = renderToString(boundary.render());
    assert.match(fallback, /Deník a ukládání úlovků můžeš dál používat/);
    assert.doesNotMatch(fallback, /optional analysis failed/);
  } finally { await server.close(); }
});
