import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("disabled Home fish activity actions share the compact action row", async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
  try {
    const { default: FishActivity } = await server.ssrLoadModule("/src/features/home/components/FishActivity.jsx");
    const { StaticRouter } = await server.ssrLoadModule("react-router");
    const html = renderToString(React.createElement(
      StaticRouter,
      { location: "/" },
      React.createElement(FishActivity),
    ));
    const actionRow = html.match(/<div class="fish-activity-actions fish-activity-actions--compact">([\s\S]*?)<\/div>/)?.[1];

    assert.ok(actionRow, "compact action row should wrap both controls");
    assert.ok(actionRow.indexOf("fish-activity-detail-link") < actionRow.indexOf("fish-activity-action"));
  } finally {
    await server.close();
  }
});
