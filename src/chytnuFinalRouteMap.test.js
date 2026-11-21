import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchRoutes } from "react-router-dom";
import { FEATURES } from "./product/config/featureFlags.js";
import { pageBackFallback, isKnownPage, rememberPage, internalBackSteps } from "./shared/layout/pageNavigation.js";
import { createNavigationMemory } from "./shared/layout/navigationMemory.js";

const routesWithoutBack = new Set(["/", "/journal", "/community", "/profile", "/login", "/onboarding", "/map", "/community/find", "*"]);
const enabled = Object.fromEntries(Object.keys(FEATURES).map(key => [key, true]));
const routeSample = route => route.replace(/:\w+\??|\/\*/g, token => token === "/*" ? "/reports" : "fixture");

test("each application route has exactly one owner in the final product map", async () => {
  const [router, map, inventory] = await Promise.all([
    readFile(new URL("./app/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/CHYTNU_FINAL_ROUTE_MAP.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/CHYTNU_FEATURE_DISCOVERABILITY.md", import.meta.url), "utf8"),
  ]);
  const runtimeRoutes = [...router.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map(([, path]) => path);
  const mappedRoutes = [...map.matchAll(/^- `([^\n`]+)` · (\d{2}) · .+/gm)];
  assert.equal(runtimeRoutes.length, 57);
  assert.ok(mappedRoutes.every(([, , owner]) => Number(owner) >= 1 && Number(owner) <= 23));
  assert.equal(new Set(mappedRoutes.map(([, path]) => path)).size, mappedRoutes.length);
  assert.deepEqual(mappedRoutes.map(([, path]) => path).sort(), runtimeRoutes.sort());
  assert.deepEqual([...inventory.matchAll(/^\| [^|]+ \| `([^`]+)` \|/gm)].map(([, path]) => path).sort(), runtimeRoutes.sort());
  const routes = runtimeRoutes.map(path => ({ path }));
  for (const route of runtimeRoutes.filter(path => !routesWithoutBack.has(path))) {
    const sample = routeSample(route);
    const back = pageBackFallback(sample, enabled);
    assert.ok(back && back !== sample, route);
    assert.notEqual(matchRoutes(routes, back)?.at(-1)?.route.path, "*", route);
    assert.ok(isKnownPage(back, enabled), route);
  }
});

test("compatibility URLs point to the sole search and map destinations", async () => {
  const [router, community, profile, settings] = await Promise.all([
    readFile(new URL("./app/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("./pages/CommunityPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./pages/ProfilePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./pages/SettingsPage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(router, /path="\/map" element=\{<LegacyRouteRedirect pathname="\/journal\/map"/);
  assert.match(router, /isFeatureEnabled\("community"\) && isFeatureEnabled\("userDiscovery"\) && <Route path="\/community\/find" element=\{<LegacyRouteRedirect pathname="\/community" fallbackHash="#fisher-search"/);
  assert.match(router, /to=\{\{ pathname, search, hash: hash \|\| fallbackHash \}\} state=\{state\} replace/);
  assert.match(community, /isFeatureEnabled\("userDiscovery"\) && <FisherDiscovery/);
  const routes = [...router.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map(([, path]) => ({ path }));
  for (const [, target] of profile.matchAll(/<ProfileSectionLink to="(\/[^"]+)"/g)) {
    const leaf = matchRoutes(routes, target)?.at(-1)?.route.path;
    assert.ok(leaf && leaf !== "*", target);
    assert.ok(!["/map", "/community/find"].includes(target), target);
  }
  assert.match(profile, /id="local-backup"[\s\S]+onClick=\{exportBackup\}/);
  assert.match(settings, /to="\/profile#local-backup"/);
  assert.match(settings, /onClick=\{exportCloudAccount\}/);
  assert.doesNotMatch(settings, /readLocalBackupSnapshot|serializeLocalBackupJson/);
});

test("known history supplies internal parents without a loop after replacing an edit", () => {
  const entries = new Map();
  const visit = (key, pathname, action, current) => rememberPage(entries, current, { key, pathname, hash: "" }, action);
  const journal = visit("direct", "/journal", "POP");
  const catchPage = visit("catch", "/catch/42", "PUSH", journal);
  const editor = visit("edit", "/catch/42/edit", "PUSH", catchPage);
  assert.equal(internalBackSteps(entries, editor), 1);
  const updated = visit("saved", "/catch/42", "REPLACE", editor);
  assert.equal(internalBackSteps(entries, updated), 2);
  assert.equal(visit("direct", "/journal", "POP", updated), journal);
});

test("direct entry and reload have no previous in-app entry and use canonical fallback", () => {
  const location = { key: "retained-browser-key", pathname: "/waters/catalogue/ris-a", hash: "" };
  const entries = new Map();
  const page = rememberPage(entries, null, location, "POP");
  assert.equal(internalBackSteps(entries, page), 0);
  assert.equal(pageBackFallback(location.pathname), "/waters/catalogue");
  assert.equal(pageBackFallback("/trips/2026/edit"), "/trips/2026");
  assert.equal(pageBackFallback("/waters/471/edit"), "/waters/471");
});

test("a disabled destination cannot become a history-based return target", () => {
  const pilot = { ...FEATURES, community: false, userDiscovery: false, friends: false, publicProfiles: false };
  const entries = new Map();
  const closed = rememberPage(entries, null, { key: "closed", pathname: "/community", hash: "" }, "POP");
  const page = rememberPage(entries, closed, { key: "stats", pathname: "/stats", hash: "" }, "PUSH");
  assert.equal(internalBackSteps(entries, page, { features: pilot }), 0);
  assert.equal(pageBackFallback("/friends", pilot), null);
  assert.equal(pageBackFallback("/messages/fixture", pilot), null);
  assert.equal(pageBackFallback("/waters/fixture/chat", pilot), null);
});

test("contextual scroll and view state are retained per entry and isolated across scopes", () => {
  const navigation = createNavigationMemory("account:a");
  const journal = { key: "journal", pathname: "/journal", hash: "" };
  navigation.record(journal, "POP");
  navigation.saveView("journal", "filters", { favoriteOnly: true });
  navigation.saveScroll(620);
  navigation.record({ key: "detail", pathname: "/catch/42", hash: "" }, "PUSH");
  navigation.requestRestore();
  navigation.record(journal, "POP");
  assert.deepEqual(navigation.readView("journal", "filters"), { favoriteOnly: true });
  assert.equal(navigation.restoreScroll("journal"), 620);
  assert.equal(navigation.restoreScroll("journal"), null);
  assert.equal(createNavigationMemory("account:b").readView("journal", "filters"), undefined);
});
