import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { createServer } from "vite";

test("online feed presents only approved fields and honest states", async t => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [], entries: [] } });
  try {
    const { SocialPostCard, SocialFeedState } = await server.ssrLoadModule("/src/features/social/components/SocialFeed.jsx");
    const render = (component, props) => renderToStaticMarkup(React.createElement(StaticRouter, { location: "/community" }, React.createElement(component, props)));
    const post = { id: "public-1", author: { uid: "angler-1", displayName: "Petr", handle: "petr", badgeRole: "OWNER" }, content: { species: "Kapr", lengthCm: 53, weightKg: null, caughtAt: "2026-11", description: "<script>alert(1)</script>", privateGps: "SECRET-GPS" }, visibility: "friends", revision: 1, hasPhoto: false, sourceCatchId: "SECRET-CATCH", reactions: 88 };
    await t.test("safe text, approved measurements, public routing and trusted badge", () => {
      const html = render(SocialPostCard, { post });
      assert.match(html, /53 cm/); assert.match(html, /Pro přátele/); assert.match(html, /2026-11/);
      assert.match(html, /href="\/community\/post\/public-1"/); assert.match(html, /href="\/u\/angler-1"/);
      assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|SECRET|88|0 kg|NaN|1\. 11\./);
    });
    await t.test("offline and auth states do not expose previously loaded posts", () => {
      const child = React.createElement("span", {}, "SECRET-STALE");
      const feed = { online: false, current: { posts: [post] }, reload() {} };
      const offline = render(SocialFeedState, { feed, children: child });
      assert.match(offline, /offline/); assert.doesNotMatch(offline, /SECRET-STALE/);
      const auth = render(SocialFeedState, { feed: { ...feed, online: true, needsAuth: true }, children: child });
      assert.match(auth, /přihlas/); assert.doesNotMatch(auth, /SECRET-STALE/);
      const globalAuth = render(SocialFeedState, { mode: "global", feed: { ...feed, online: true, needsAuth: true }, children: child });
      assert.match(globalAuth, /komunitní přehled/); assert.match(globalAuth, /Místní náhledy/); assert.doesNotMatch(globalAuth, /SECRET-STALE/);
    });
    await t.test("empty and error states give truthful recovery choices", () => {
      assert.match(render(SocialFeedState, { mode: "friends", feed: { online: true, current: { posts: [] } } }), /Přátelé zatím nesdílejí/);
      const html = render(SocialFeedState, { feed: { online: true, current: { error: "Příspěvek není dostupný" }, reload() {} } });
      assert.match(html, /role="alert"/); assert.match(html, /Zkusit znovu/);
    });
    await t.test("empty permission-filtered windows preserve pagination", () => {
      const html = render(SocialFeedState, { mode: "friends", feed: { online: true, current: { posts: [], nextCursor: "next-window" } }, children: React.createElement("button", { type: "button" }, "Načíst další příspěvky") });
      assert.match(html, /V této části přehledu/);
      assert.match(html, /<button type="button">Načíst další příspěvky<\/button>/);
      assert.doesNotMatch(html, /Přátelé zatím nesdílejí/);
    });
    await t.test("numeric publication timestamps use ISO and catch dates retain shared precision", () => {
      const createdAt = Date.parse("2026-11-18T12:00:00.000Z");
      const html = render(SocialPostCard, { post: { ...post, createdAt, content: { ...post.content, caughtAt: null } } });
      assert.match(html, /dateTime="2026-11-18T12:00:00.000Z"/);
      assert.match(html, /Sdíleno 18\. 11\. 2026/);
      for (const caughtAt of ["2026", "2026-11"]) {
        const coarse = render(SocialPostCard, { post: { ...post, createdAt, content: { ...post.content, caughtAt } } });
        assert.ok(coarse.includes(`dateTime="${caughtAt}"`));
        assert.doesNotMatch(coarse, /Sdíleno 18|1\. 11\. 2026/);
      }
    });
    await t.test("narrative entries retain title and distinguish unverified achievements from confirmed milestones", () => {
      const achievement = render(SocialPostCard, { post: { ...post, kind: "achievement", content: { title: "Můj úspěch", description: "Zážitek", achievement: { title: "První úlovek", source: "unverified" } } } });
      assert.match(achievement, /Můj úspěch/); assert.match(achievement, /První úlovek/); assert.match(achievement, /server jeho splnění neověřil/); assert.doesNotMatch(achievement, /undefined|53 cm/);
      const milestone = render(SocialPostCard, { post: { ...post, kind: "milestone", content: { title: "Milník", progression: { source: "server", level: 4, xp: 450 } } } });
      assert.match(milestone, /Úroveň 4 · 450 XP/); assert.match(milestone, /v době sdílení/);
      const untrusted = render(SocialPostCard, { post: { ...post, kind: "milestone", content: { title: "Milník", progression: { source: "legacy", level: 99, xp: 999999 } } } });
      assert.doesNotMatch(untrusted, /999999|Úroveň 99/);
    });
  } finally { await server.close(); }
});
