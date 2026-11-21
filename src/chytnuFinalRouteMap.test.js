import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("each application route has exactly one owner in the final product map", async () => {
  const [router, map] = await Promise.all([
    readFile(new URL("./app/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/CHYTNU_FINAL_ROUTE_MAP.md", import.meta.url), "utf8"),
  ]);
  const runtimeRoutes = [...router.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map(([, path]) => path);
  const mappedRoutes = [...map.matchAll(/^- `([^\n`]+)` · (\d{2}) · .+/gm)];
  assert.equal(runtimeRoutes.length, 57);
  assert.ok(mappedRoutes.every(([, , owner]) => Number(owner) >= 1 && Number(owner) <= 23));
  assert.equal(new Set(mappedRoutes.map(([, path]) => path)).size, mappedRoutes.length);
  assert.deepEqual(mappedRoutes.map(([, path]) => path).sort(), runtimeRoutes.sort());
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
  assert.doesNotMatch(profile, /to="\/(?:waters|stats|gallery|map|community|friends)"/);
  assert.match(profile, /id="local-backup"[\s\S]+onClick=\{exportBackup\}/);
  assert.match(settings, /to="\/profile#local-backup"/);
  assert.match(settings, /onClick=\{exportCloudAccount\}/);
  assert.doesNotMatch(settings, /readLocalBackupSnapshot|serializeLocalBackupJson/);
});
