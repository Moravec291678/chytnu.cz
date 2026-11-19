import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const projectUrl = new URL("../", import.meta.url);

async function generatedWorker(fetchImpl) {
  const { default: config } = await import("../vite.config.js");
  const plugin = config.plugins.find(item => item.name === "chytnucz-offline-shell");
  let source;
  plugin.generateBundle.call({ emitFile: asset => { source = asset.source; } }, {}, {
    app: { fileName: "assets/app-new.js" }, html: { fileName: "index.html" },
  });
  const current = JSON.parse(/^const CACHE = (.+);$/m.exec(source)[1]);
  const rows = new Map([
    ["chytnucz-shell-previous", new Map([["/index.html", new Response("OLD")], ["/assets/app-old.js", new Response("OLD-CHUNK")]])],
    [current, new Map([["/index.html", new Response("CURRENT")]])],
    ["unrelated-cache", new Map([["other", new Response("KEEP")]])],
  ]);
  const handlers = new Map();
  const caches = {
    async open(key) {
      if (!rows.has(key)) rows.set(key, new Map());
      return { match: async path => rows.get(key).get(typeof path === "string" ? path : path.url)?.clone(),
        put: async (path, response) => { rows.get(key).set(path, response); } };
    },
    async match(request) {
      const path = typeof request === "string" ? request : new URL(request.url).pathname;
      for (const cache of rows.values()) if (cache.has(path)) return cache.get(path).clone();
    },
    keys: async () => [...rows.keys()], delete: async key => rows.delete(key),
  };
  runInNewContext(source, { self: { location: { origin: "https://chytnu.test" },
    addEventListener: (type, handler) => handlers.set(type, handler), clients: { claim: async () => {} } },
  URL, caches, fetch: fetchImpl });
  return { rows, current, handlers, async navigate(path = "/journal") {
    let response; const pending = [];
    handlers.get("fetch")({ request: { method: "GET", mode: "navigate", url: `https://chytnu.test${path}` },
      respondWith: value => { response = value; }, waitUntil: value => pending.push(value) });
    const result = await response;
    await Promise.all(pending);
    return result;
  } };
}

test("generated worker uses the current offline shell while retaining old lazy assets and unrelated storage", async () => {
  const worker = await generatedWorker(async () => { throw new Error("offline"); });
  let activation;
  worker.handlers.get("activate")({ waitUntil: value => { activation = value; } });
  await activation;
  assert.equal(await (await worker.navigate()).text(), "CURRENT");
  assert.equal(worker.rows.has("chytnucz-shell-previous"), true);
  assert.equal(worker.rows.has("unrelated-cache"), true);
  let response;
  worker.handlers.get("fetch")({ request: { method: "GET", mode: "cors", url: "https://chytnu.test/assets/app-old.js" },
    respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), "OLD-CHUNK");
});

test("generated worker caches successful HTML only; errors, other content and cache write failures preserve navigation", async () => {
  for (const [status, contentType] of [[503, "text/html"], [404, "text/html"], [200, "application/json"]]) {
    const worker = await generatedWorker(async () => new Response("UNSUITABLE", { status, headers: { "content-type": contentType } }));
    assert.equal((await worker.navigate()).status, status);
    assert.equal(await worker.rows.get(worker.current).get("/index.html").clone().text(), "CURRENT");
  }
  const worker = await generatedWorker(async () => new Response("FRESH", { headers: { "content-type": "text/html; charset=utf-8" } }));
  assert.equal(await (await worker.navigate()).text(), "FRESH");
  assert.equal(await worker.rows.get(worker.current).get("/index.html").clone().text(), "FRESH");
  worker.rows.get(worker.current).set = () => { throw new Error("cache full"); };
  assert.equal(await (await worker.navigate()).text(), "FRESH");
});

test("Vercel config builds Vite into dist and preserves SPA routes", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", projectUrl), "utf8"));
  assert.equal(config.framework, "vite");
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.deepEqual(config.rewrites, [
    { source: "/api/social", destination: "/api/account/delete?social=1" },
    { source: "/api/admin", destination: "/api/account/delete?admin=1" },
    { source: "/(.*)", destination: "/index.html" },
  ]);
  assert.ok(config.headers.some((entry) => entry.source === "/sw.js"
    && entry.headers.some((header) => header.key === "Cache-Control" && header.value.includes("max-age=0"))));
  const baselineHeaders = config.headers.find((entry) => entry.source === "/(.*)")?.headers ?? [];
  assert.ok(baselineHeaders.some((header) => header.key === "X-Content-Type-Options" && header.value === "nosniff"));
  assert.ok(baselineHeaders.some((header) => header.key === "Referrer-Policy" && header.value === "strict-origin-when-cross-origin"));
  assert.ok(baselineHeaders.some((header) => header.key === "Permissions-Policy" && header.value.includes("geolocation=(self)")));
});

test("generated service worker bypasses every non-GET request without cloning or replaying it", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /if \(request\.method !== 'GET' \|\| url\.origin !== self\.location\.origin\) return;/);
  assert.doesNotMatch(config, /event\.respondWith\(fetch\(event\.request\)\)/);
});

test("production registers service worker with HTTP cache bypass for prompt app updates", async () => {
  const source = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(source, /serviceWorker\.register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
});

test("offline shell precaches all generated route and feature chunks, including lazy imports", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /const generated = Object\.values\(bundle\)\.map\(\(item\) => `\/\$\{item\.fileName\}`\);/);
  assert.match(config, /const files = \[[^\]]+\.\.\.generated\];/);
  assert.match(config, /cache\.addAll\(FILES\)/);
});

test("service worker keeps one prior shell for open tabs and only caches same-origin static assets", async () => {
  const config = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /const previous = keys\.filter\(\(key\) => key\.startsWith\('chytnucz-shell-'\) && key !== CACHE\);/);
  assert.match(config, /const keep = previous\[previous\.length - 1\];/);
  assert.match(config, /previous\.filter\(\(key\) => key !== keep\)\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(config, /url\.pathname\.startsWith\('\/assets\/'\) \|\| \['\/favicon\.svg', '\/icons\.svg', '\/icon-192\.png', '\/icon-512\.png', '\/manifest\.webmanifest'\]/);
  assert.match(config, /url\.origin !== self\.location\.origin/);
  assert.doesNotMatch(config, /url\.pathname\.startsWith\('\/api\//);
});

test("environment example declares public client variables without server credentials", async () => {
  const content = await readFile(new URL(".env.example", projectUrl), "utf8");
  for (const variable of [
    "VITE_BACKEND_MODE",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_API_BASE_URL",
    "VITE_WEB_PUSH_PUBLIC_KEY",
    "VITE_FIREBASE_GOOGLE_AUTH_ENABLED",
  ]) assert.match(content, new RegExp(`^${variable}=`, "m"));
  assert.doesNotMatch(content, /PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN_CREDENTIAL/i);
});
