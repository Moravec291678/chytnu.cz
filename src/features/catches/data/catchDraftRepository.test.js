import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catchDraftRepository, CATCH_DRAFT_TTL_MS, CATCH_DRAFT_VERSION } from "./catchDraftRepository.js";
import { applySelectedWaterToCatchDraft } from "./catchDraftModel.js";
import { applyManualMapLocation } from "./manualMapLocation.js";
import { accountScopeKey, createGuestScopeKey } from "../../auth/data/localDataScope.js";

const scope = () => ({ scopeKey: createGuestScopeKey(), ownerId: null });

test("Add Catch → add a water → return restores all form fields and the new water after reload", async () => {
  const activeScope = scope();
  const photoBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  const catchFields = {
    speciesKey: "commonCarp",
    lengthCm: "82",
    weightKg: "7.4",
    weightSource: "manual",
    fishingMethod: "feeder",
    baits: ["corn", "boilie"],
    notes: "U rákosí",
    gpsLocation: "49.123456, 14.123456",
    coordinates: { latitude: 49.123456, longitude: 14.123456 },
    catchDate: "2026-10-28",
    catchTime: "06:40",
    waterId: "",
    locationName: "",
    waterNumber: "",
    conditions: { airTempC: "8", waterTempC: "12", pressureHpa: "1012", windKmh: "5", moonPhase: "full" },
    conditionSources: { airTempC: "manual" },
    depthM: "2.5",
    bottomType: "gravel",
    girthCm: "48",
    fightDurationMin: "8",
    resultKey: "released",
    isFavorite: true,
    tripId: "trip-1",
    photos: [{ id: "photo-1", blob: photoBlob, name: "kapr.jpg", type: "image/jpeg", size: 4, previewUrl: "blob:temporary" }],
    privacy: { visibility: "private", photoVisibility: "private", privateSpot: true, locationPrecision: "none" },
  };
  const uiState = { displayFull: true, showSpeciesPicker: false, manualWaterChoice: false, waterSuggestionDismissed: false };
  await catchDraftRepository.save(catchFields, uiState, activeScope);

  // Add Water unmounts Add Catch; returning with a newly created water updates the pending form draft.
  const draftOnAddWater = await catchDraftRepository.get(activeScope);
  const selectedWater = { id: "water-1", name: "Lipno", waterNumber: "421 200" };
  const resumedFields = applySelectedWaterToCatchDraft(draftOnAddWater.data, selectedWater);
  await catchDraftRepository.save(resumedFields, { ...draftOnAddWater.uiState, manualWaterChoice: true }, activeScope);

  const reloadedDraft = await catchDraftRepository.get(activeScope);
  assert.equal(reloadedDraft.version, CATCH_DRAFT_VERSION);
  assert.deepEqual(reloadedDraft.data, {
    ...catchFields,
    photos: [{ id: "photo-1", blob: photoBlob, name: "kapr.jpg", type: "image/jpeg", size: 4 }],
    waterId: selectedWater.id,
    locationName: selectedWater.name,
    waterNumber: "421200",
  });
  assert.deepEqual(reloadedDraft.uiState, { ...uiState, manualWaterChoice: true });
  assert.equal(reloadedDraft.data.photos[0].blob.size, 4);
  assert.equal(reloadedDraft.data.photos[0].blob.type, "image/jpeg");
});

test("drafts are isolated by profile, versioned, and expire after seven days", async () => {
  const firstScope = scope();
  const secondOwnerId = `draft-test-${crypto.randomUUID()}`;
  const secondScope = { scopeKey: accountScopeKey(secondOwnerId), ownerId: secondOwnerId };
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  await catchDraftRepository.save({ notes: "Jen pro tento profil", photos: [] }, {}, firstScope, now);
  assert.equal((await catchDraftRepository.get(secondScope, now))?.data, undefined);
  assert.equal((await catchDraftRepository.get(firstScope, now)).version, CATCH_DRAFT_VERSION);
  assert.equal(await catchDraftRepository.get(firstScope, now + CATCH_DRAFT_TTL_MS), null);
});

test("manual map coordinates and source survive draft persistence and reload", async () => {
  const activeScope = scope();
  const data = {
    ...applyManualMapLocation({ speciesKey: "commonCarp", notes: "Vybraný bod", gpsSource: "default", photos: [] },
      { latitude: 49.123456, longitude: 14.123456 }),
  };
  await catchDraftRepository.save(data, {}, activeScope);
  const restored = await catchDraftRepository.get(activeScope);
  assert.equal(restored.data.gpsSource, "manual-map");
  assert.deepEqual(restored.data.coordinates, data.coordinates);
  assert.equal(restored.data.gpsLocation, data.gpsLocation);
  assert.equal(restored.data.notes, data.notes);
});

test("Add Catch routes to Add Water only after saving the draft and returns with the created water selected", async () => {
  const [catchPage, waterPage] = await Promise.all([
    readFile(new URL("../../../pages/AddCatchPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../../pages/WaterCreatePage.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(catchPage, /await persistDraft\(\);\s*navigate\("\/waters\/new\?returnToAddCatch=1", \{ state: \{ returnToAddCatch: true \} \}\);/);
  assert.match(waterPage, /navigate\("\/add", \{ replace: true, state: \{ preselectedWaterId: record\.id \} \}\);/);
});
