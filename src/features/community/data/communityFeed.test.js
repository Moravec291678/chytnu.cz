import test from "node:test";
import assert from "node:assert/strict";
import { buildLocalCommunityFeed } from "./communityFeed.js";

const base = {
  species: "Kapr",
  speciesKey: "kapr",
  caughtAt: "2026-10-19T10:00:00.000Z",
  weightKg: 8.1,
  weightSource: "manual",
  lengthCm: 74,
  notes: "tajná poznámka",
  coordinates: { latitude: 50, longitude: 14 },
  locationName: "Tajné místo",
  photos: [{ id: "private", blob: new Blob(["x"]), type: "image/jpeg" }],
};

test("local Community preview contains only explicitly public catches", () => {
  const feed = buildLocalCommunityFeed([
    { ...base, id: "private", privacy: { visibility: "private" } },
    { ...base, id: "public", privacy: { visibility: "public", privateSpot: true } },
  ]);

  assert.equal(feed.length, 1);
  assert.equal(feed[0].id, "local:public");
  assert.equal(feed[0].catchId, "public");
});

test("local Community preview never exposes private location, notes, owner or photo blobs", () => {
  const [item] = buildLocalCommunityFeed([{
    ...base,
    id: "safe",
    ownerId: "account-id",
    scopeKey: "account:account-id",
    tripId: "private-trip",
    sync: { status: "synced", revision: 7 },
    privacy: { visibility: "public", photoVisibility: "public", privateSpot: true, locationPrecision: "exact" },
  }]);
  const serialized = JSON.stringify(item.projection);

  assert.equal("notes" in item.projection, false);
  assert.equal("coordinates" in item.projection, false);
  assert.equal("locationName" in item.projection, false);
  assert.equal("ownerId" in item.projection, false);
  assert.equal("scopeKey" in item.projection, false);
  assert.equal("tripId" in item.projection, false);
  assert.equal("sync" in item.projection, false);
  assert.equal(serialized.includes("Tajné místo"), false);
  assert.deepEqual(item.projection.photos, []);
});

test("local Community preview is chronological and contains no invented rows", () => {
  const feed = buildLocalCommunityFeed([
    { ...base, id: "older", caughtAt: "2026-09-01T10:00:00.000Z", privacy: { visibility: "public" } },
    { ...base, id: "newer", caughtAt: "2026-10-01T10:00:00.000Z", privacy: { visibility: "public" } },
  ]);
  assert.deepEqual(feed.map((item) => item.catchId), ["newer", "older"]);
});
