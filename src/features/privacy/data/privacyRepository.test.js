import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { privacyRepository } from "./privacyRepository.js";

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("chytnu-local");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

test("privacy settings persist per account scope and use public catch visibility without an explicit preference", async () => {
  await resetDatabase();
  const first = { scopeKey: accountScopeKey("angler-a"), ownerId: "angler-a" };
  const second = { scopeKey: accountScopeKey("angler-b"), ownerId: "angler-b" };

  await privacyRepository.put({
    profileVisibility: "public",
    defaultCatchVisibility: "public",
    defaultCatchVisibilityExplicit: true,
    defaultPhotoVisibility: "private",
    defaultLocationPrecision: "approximate",
    privateSpotDefault: false,
    nearbyOptIn: true,
    nearbyLocationPrecision: "none",
    heatmapGranularity: "city",
  }, first);

  const persisted = await privacyRepository.get(first);
  assert.equal(persisted.hasSavedSettings, true);
  assert.equal(persisted.profileVisibility, "public");
  assert.equal(persisted.defaultLocationPrecision, "approximate");
  assert.equal(persisted.nearbyOptIn, true);
  assert.equal(persisted.nearbyLocationPrecision, "none");
  assert.equal(persisted.heatmapGranularity, "city");
  assert.equal(persisted.heatmapOptIn, true);

  const isolated = await privacyRepository.get(second);
  assert.equal(isolated.hasSavedSettings, false);
  assert.equal(isolated.profileVisibility, "private");
  assert.equal(isolated.defaultCatchVisibility, "public");
  assert.equal(isolated.defaultCatchVisibilityExplicit, false);
  assert.equal(isolated.defaultLocationPrecision, "none");
  assert.equal(isolated.nearbyOptIn, false);
  assert.equal(isolated.nearbyLocationPrecision, "approximate");
  assert.equal(isolated.heatmapGranularity, "off");

  const thirdOwner = "angler-c";
  const third = { scopeKey: accountScopeKey(thirdOwner), ownerId: thirdOwner };
  await privacyRepository.put({ defaultCatchVisibility: "private", defaultCatchVisibilityExplicit: true }, third);
  const explicitPrivate = await privacyRepository.get(third);
  assert.equal(explicitPrivate.defaultCatchVisibility, "private");
  assert.equal(explicitPrivate.defaultCatchVisibilityExplicit, true);
});
