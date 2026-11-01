import { setImmediate } from "node:timers";
import test from "node:test";
import assert from "node:assert/strict";
import { createDetailPhotoDelivery } from "./detailPhotoDelivery.js";

const scope = { ownerId: "owner", scopeKey: "scope", catchId: "catch" };
const photos = ["fast", "medium", "slow"].map(id => ({ id, cloud: { state: "synced", sha256: id } }));
const flush = () => new Promise(resolve => setImmediate(resolve));

test("detail publishes each 0/120/600 ms delivery independently and clears all pending", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let visible;
  const detail = createDetailPhotoDelivery(({ photo }) => new Promise(resolve =>
    setTimeout(() => resolve(new Blob([photo.id])), { fast: 0, medium: 120, slow: 600 }[photo.id])),
  rows => { visible = rows.map(row => row.id); });
  t.after(() => detail.close());
  detail.update(photos, scope);
  await flush();
  for (const [delta, expected] of [[0, ["fast"]], [120, ["fast", "medium"]], [480, ["fast", "medium", "slow"]]]) {
    t.mock.timers.tick(delta);
    await flush();
    assert.deepEqual(visible, expected);
  }
  assert.equal(photos.length - visible.length, 0);
});

test("realtime replaces only the changed request and transient retry leaves successful photos alone", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const old = Promise.withResolvers();
  const calls = [];
  let visible, errors;
  const detail = createDetailPhotoDelivery(async ({ photo }) => {
    const hash = photo.cloud.sha256;
    calls.push(hash);
    if (hash === "slow") return old.promise;
    if (hash === "medium" && calls.filter(value => value === hash).length === 1) throw new Error("offline");
    return new Blob([hash]);
  }, (rows, failures) => { visible = rows; errors = failures; });
  t.after(() => detail.close());
  detail.update(photos, scope);
  await flush();
  assert.deepEqual(visible.map(row => row.id), ["fast"]);
  assert.equal(errors.length, 1);
  const fastURL = visible[0].url;
  detail.update([photos[0], photos[1], { ...photos[2], cloud: { ...photos[2].cloud, sha256: "new" } }], scope);
  await flush();
  old.resolve(new Blob(["obsolete"]));
  t.mock.timers.tick(1000);
  await flush();
  assert.deepEqual(calls, ["fast", "medium", "slow", "new", "medium"]);
  assert.equal(visible[0].url, fastURL);
  assert.equal(await visible[2].blob.text(), "new");
  assert.equal(visible.length, 3);
  assert.deepEqual(errors, []);
});

test("four gallery photos at 0/200/2000/5000 ms render as each delivery completes", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const items = ["a", "b", "c", "d"].map(id => ({ id, cloud: { state: "synced", sha256: id } }));
  const delays = { a: 0, b: 200, c: 2000, d: 5000 };
  let visible = [];
  const detail = createDetailPhotoDelivery(({ photo }) => new Promise(resolve =>
    setTimeout(() => resolve(new Blob([photo.id])), delays[photo.id])), rows => { visible = rows.map(row => row.id); });
  t.after(() => detail.close());
  detail.update(items, scope);
  await flush();
  for (const [delta, expected] of [[0, ["a"]], [200, ["a", "b"]], [1800, ["a", "b", "c"]],
    [3000, ["a", "b", "c", "d"]]]) {
    t.mock.timers.tick(delta);
    await flush();
    assert.deepEqual(visible, expected);
  }
});
