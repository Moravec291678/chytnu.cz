import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

test("admin route, Profile link and delegated navigation render safely without trusting frontend roles", async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { default: Page, AdminWorkspace } = await server.ssrLoadModule("/src/features/admin/AdminDashboard.jsx");
    const { default: ProfileLink } = await server.ssrLoadModule("/src/features/admin/ProfileAdminLink.jsx");
    const { AuthContext } = await server.ssrLoadModule("/src/features/auth/context/authContextValue.js");
    const { StaticRouter } = await server.ssrLoadModule("react-router-dom/server");
    const render = (component, location = "/admin", user = null) => renderToString(React.createElement(StaticRouter, { location }, React.createElement(AuthContext.Provider, { value: { user } }, component)));
    const denied = render(React.createElement(Page));
    assert.match(denied, /přihlas pověřeným účtem/); assert.doesNotMatch(denied, /Sekce administrace/);
    assert.equal(render(React.createElement(ProfileLink), "/profile"), "");
    assert.equal(render(React.createElement(ProfileLink), "/profile", { uid: "ordinary-user", role: "OWNER", customClaims: { admin: true } }), "");
    const client = { ownerId: "owner", request: async () => ({}) };
    const owner = render(React.createElement(AdminWorkspace, { session: { client, access: { uid: "owner", role: "OWNER", permissions: [] } } }));
    for (const section of ["users", "limits", "features", "ai", "tasks", "monitoring", "audit", "settings"]) assert.match(owner, new RegExp(`href="/admin/${section}"`));
    const { default: Badge } = await server.ssrLoadModule("/src/features/admin/CollaboratorBadge.jsx");
    const coAccess = { uid: "co", role: "CO_CREATOR", permissions: ["tasks", "monitoring"] };
    const link = render(React.createElement(ProfileLink, { access: coAccess }), "/profile");
    assert.match(link, /href="\/admin"/); assert.match(link, /Správa aplikace, uživatelů a nastavení/);
    assert.equal(render(React.createElement(ProfileLink, { access: { role: "TESTER" } }), "/profile"), "");
    const co = render(React.createElement(AdminWorkspace, { session: { client, access: coAccess } }));
    assert.match(co, /Spolutvůrce ChytnuCz/);
    assert.match(co, /admin-workspace/); assert.match(co, /Produkt a vývoj/);
    assert.doesNotMatch(co, /Gamifikace|Komunikace/);
    assert.match(co, /href="\/admin\/tasks"/);
    assert.doesNotMatch(co, /href="\/admin\/(users|limits|features|settings|audit)"/);
    assert.match(render(React.createElement(Badge, { access: coAccess })), /Co-Creator &amp; Fishing Lead/);
    assert.match(render(React.createElement(Badge, { access: { role: "OWNER" } })), /Founder &amp; Owner/);
    assert.equal(render(React.createElement(Badge, { access: { role: "USER", badge: "OWNER" } })), "");
    const delegated = render(React.createElement(AdminWorkspace, { session: { client, access: { uid: "delegate", role: "ADMIN", permissions: ["tasks"] } } }), "/admin/tasks");
    assert.match(delegated, /Úkoly a vývoj/); assert.doesNotMatch(delegated, /href="\/admin\/(users|limits|features|settings|audit)"/);
    assert.match(render(React.createElement(AdminWorkspace, { session: { client, access: { uid: "delegate", role: "ADMIN", permissions: ["tasks"] } } }), "/admin/users"), /není pro tvé oprávnění dostupná/);
  } finally { await server.close(); }
});
