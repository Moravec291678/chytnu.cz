import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { buildWaterActivity, createWaterRecord, filterWaters, updateWaterRecord, validateWaterForm } from "./waterModel.js";
import { waterRepository } from "./waterRepository.js";

test("water model creates valid records with default values", () => {
  const validationError = validateWaterForm({ name: "" });
  assert.equal(validationError.name, "Zadej název revíru.");

  const valid = validateWaterForm({ name: "Vltava 6" });
  assert.deepEqual(valid, {});

  const water = createWaterRecord({ name: "Vltava 6", waterNumber: "401018", type: "Řeka" });
  assert.ok(water.id);
  assert.equal(water.name, "Vltava 6");
  assert.equal(water.waterNumber, "401018");
  assert.equal(water.type, "Řeka");
  assert.equal(water.moderationStatus, "pending");
  assert.equal(water.isFavorite, false);
});

test("new local Water keeps a stable ID, pending moderation and selected species", () => {
  const id = crypto.randomUUID();
  const water = createWaterRecord({
    id,
    name: "  Lom u lesa  ",
    type: "Lom",
    area: "Berounsko",
    targetFish: ["Kapr", "Štika", "Kapr"],
    moderationStatus: "verified",
  }, { scopeKey: "guest-add-water" });

  assert.equal(water.id, id);
  assert.equal(water.scopeKey, "guest-add-water");
  assert.equal(water.name, "Lom u lesa");
  assert.deepEqual(water.targetFish, ["Kapr", "Štika"]);
  assert.equal(water.moderationStatus, "pending");
  assert.equal(water.coordinates, null);
});

test("editing Water preserves stable profile, favorite, coordinates, and moderation data", () => {
  const existing = {
    ...createWaterRecord({
    id: "water-existing", name: "Původní název", isFavorite: true,
      coordinates: { latitude: 49.8, longitude: 14.2 },
    }, { scopeKey: "water-edit-scope", ownerId: "owner-1" }),
    moderationStatus: "verified",
  };
  const updated = updateWaterRecord(existing, {
    name: "  Nový název  ", type: "Řeka", waterNumber: " 411050 ", targetFish: ["Kapr", "Kapr"],
  });
  assert.equal(updated.id, existing.id);
  assert.equal(updated.scopeKey, existing.scopeKey);
  assert.equal(updated.ownerId, existing.ownerId);
  assert.equal(updated.isFavorite, true);
  assert.deepEqual(updated.coordinates, existing.coordinates);
  assert.equal(updated.moderationStatus, existing.moderationStatus);
  assert.equal(updated.name, "Nový název");
  assert.equal(updated.waterNumber, "411050");
  assert.deepEqual(updated.targetFish, ["Kapr"]);
});

test("water form validates bounded text and the four supported water types", () => {
  assert.equal(validateWaterForm({ name: "Vltava", type: "Moře" }).type, "Vyber platný druh vody.");
  assert.ok(validateWaterForm({ name: "x".repeat(121) }).name);
  assert.ok(validateWaterForm({ name: "Vltava", area: "x".repeat(161) }).area);
  assert.deepEqual(validateWaterForm({ name: "Vltava", type: "Řeka", targetFish: ["Kapr"] }), {});
});

test("water filtering by search, type, and favorite", () => {
  const waters = [
    createWaterRecord({ name: "Vltava 6", type: "Řeka", isFavorite: true }),
    createWaterRecord({ name: "Lipno", type: "Přehrada", isFavorite: false }),
    createWaterRecord({ name: "Rybník Svět", type: "Rybník", isFavorite: true }),
  ];

  assert.equal(filterWaters(waters, { query: "vltava" }).length, 1);
  assert.equal(filterWaters(waters, { favoriteOnly: true }).length, 2);
  assert.equal(filterWaters(waters, { type: "Přehrada" }).length, 1);
});

test("water search matches accent-insensitive name, water number, and type", () => {
  const waters = [
    createWaterRecord({ name: "Řeka Desná", waterNumber: "401018", type: "Řeka" }),
    createWaterRecord({ name: "Rybník Dubový", type: "Rybník" }),
  ];
  assert.equal(filterWaters(waters, { query: "reka desna" })[0].name, "Řeka Desná");
  assert.equal(filterWaters(waters, { query: "401018" })[0].waterNumber, "401018");
  assert.equal(filterWaters(waters, { query: "rybnik" }).length, 1);
});

test("water activity counts only recent linked catches and trips and marks a current trip", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  const waters = [
    { id: "water-1", name: "Rybník Dubový", waterNumber: "401018" },
    { id: "water-2", name: "Řeka Desná", waterNumber: "401019" },
  ];
  const activity = buildWaterActivity(waters, [
    { id: "catch-recent", waterId: "water-1", caughtAt: "2026-10-19T09:00:00.000Z" },
    { id: "catch-old", waterId: "water-1", caughtAt: "2026-08-01T09:00:00.000Z" },
    { id: "catch-unlinked", locationName: "Nespojený rybník", caughtAt: "2026-10-18T09:00:00.000Z" },
  ], [
    { id: "trip-active", locationName: "Rybník Dubový", startedAt: "2026-10-20T10:00:00.000Z", endedAt: null },
    { id: "trip-other", waterId: "water-2", startedAt: "2026-10-17T10:00:00.000Z", endedAt: "2026-10-17T14:00:00.000Z" },
  ], { now });
  assert.deepEqual(activity.get("water-1"), { recentCount: 2, isActive: true });
  assert.deepEqual(activity.get("water-2"), { recentCount: 1, isActive: false });
});

test("water repository stores, reloads, lists and opens a local pending Water with species", async () => {
  const scope = { scopeKey: "test-scope" };
  const water = createWaterRecord({ name: "Labe 24", waterNumber: "411050", targetFish: ["Candát", "Sumec"] }, scope);
  await waterRepository.put(water, scope);

  const list = await waterRepository.list(scope);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Labe 24");

  const single = await waterRepository.get(water.id, scope);
  assert.equal(single.id, water.id);
  assert.equal(single.moderationStatus, "pending");
  assert.deepEqual(single.targetFish, ["Candát", "Sumec"]);

  // Water chat
  const msg = await waterRepository.addMessage({ waterId: water.id, text: "Dnes berou kapři na feeder", author: "Místní profil", scope });
  assert.equal(msg.text, "Dnes berou kapři na feeder");

  const messages = await waterRepository.listMessages(water.id, scope);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Dnes berou kapři na feeder");
  assert.equal((await waterRepository.listMessages(water.id, { scopeKey: "different-scope" })).length, 0);
});
