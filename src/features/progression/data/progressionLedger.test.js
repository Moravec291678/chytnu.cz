import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { catchRepository, getActiveGuestScopeKey } from "../../catches/data/catchRepository.js";
import { tripRepository } from "../../trips/data/tripRepository.js";
import { waterRepository } from "../../waters/data/waterRepository.js";
import { buildCatchRewardFromLedger, buildLedgerProgressionSummary, claimCatchRewardEventIds, getCatchRewardEventIds, progressionLedger, summaryForXp } from "./progressionLedger.js";
import { xpForLevel } from "./progression.js";
import { sha256Blob } from "../../catches/data/photoCloudProvider.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { evaluateCatchVerification } from "../../catches/data/catchVerification.js";

async function reset() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("chytnu-local");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  return { scopeKey: await getActiveGuestScopeKey(), ownerId: null };
}

function record(id, overrides = {}) {
  const stamp = "2026-10-19T10:00:00.000Z";
  return { id, schemaVersion: 1, createdAt: stamp, updatedAt: stamp, caughtAt: stamp, species: "Kapr", speciesKey: "carp", tripId: null, photos: [], sync: { status: "local", revision: 1 }, ...overrides };
}

test("catch progression events are persistent and idempotent across retries and edits", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("catch-1"), scope);
  await progressionLedger.reconcileCatch(stored, scope);
  await progressionLedger.reconcileCatch(stored, scope);
  let events = await progressionLedger.list(scope);
  const initialXp = events.reduce((sum, event) => sum + event.xp, 0);
  assert.equal(events.filter((event) => event.type === "catch.created").length, 1);
  assert.equal(events.filter((event) => event.type === "species.first").length, 1);
  assert.equal(events.filter((event) => event.type === "achievement.unlocked" && event.reasonKey.endsWith("first-catch")).length, 1);
  const edited = await catchRepository.put({ ...stored, photos: [{ id: "p", blob: new Blob(["x"]) }], sync: { ...stored.sync, revision: 2 } }, scope);
  await progressionLedger.reconcileCatch(edited, scope);
  await progressionLedger.reconcileCatch(edited, scope);
  events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.type === "catch.photo").length, 1);
  assert.equal(events.reduce((sum, event) => sum + event.xp, 0), initialXp + 5);
});

test("unverified Catch earns zero XP, later verification awards once, and a repeated photo hash earns nothing", async () => {
  const scope = await reset();
  const stamp = "2026-10-28T10:00:00.000Z";
  const photoBlob = new Blob(["evidence photo"], { type: "image/jpeg" });
  const photoHash = await sha256Blob(photoBlob);
  const unverified = await catchRepository.put(record("awaiting-proof", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "carp", photos: [],
    verification: { status: "unverified", reason: "missing-photo", photoHash: null, photoCaptureMetadata: null, locationSource: null, gpsAccuracyMeters: null, verifiedAt: null },
  }), scope);
  await progressionLedger.reconcile(scope);
  assert.equal((await progressionLedger.list(scope)).reduce((sum, event) => sum + event.xp, 0), 0);

  const verified = await catchRepository.put({
    ...unverified,
    photos: [{ id: "evidence-1", type: "image/jpeg", blob: photoBlob, contentSha256: photoHash }],
    verification: { status: "verified", reason: "live-gps-active-trip", photoHash, photoCaptureMetadata: null,
      locationSource: "live-gps", gpsAccuracyMeters: 12, verifiedAt: "2026-10-28T10:01:00.000Z" },
    sync: { ...unverified.sync, revision: 2 },
  }, scope);
  await progressionLedger.reconcile(scope);
  await progressionLedger.reconcile(scope);
  let events = await progressionLedger.list(scope);
  const firstCatchXp = events.filter((event) => event.sourceEntityId === verified.id && event.type.startsWith("catch."))
    .reduce((sum, event) => sum + event.xp, 0);
  assert.equal(firstCatchXp, 15);
  assert.equal(events.filter((event) => event.type === "catch.created" && event.sourceEntityId === verified.id).length, 1);
  assert.equal(events.filter((event) => event.reasonKey === `verification.photo.claimed:${photoHash}`).length, 1);

  const duplicate = await catchRepository.put(record("same-photo-again", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "pike", species: "Štika",
    photos: [{ id: "evidence-duplicate", type: "image/jpeg", cloud: { state: "synced", sha256: photoHash } }],
    verification: { status: "verified", reason: "live-gps-at-water", photoHash, photoCaptureMetadata: null,
      locationSource: "live-gps", gpsAccuracyMeters: 12, verifiedAt: "2026-10-28T10:02:00.000Z" },
    sync: { status: "metadata-synced", revision: 1, serverRevision: 1 },
  }), scope);
  await progressionLedger.reconcile(scope);
  events = await progressionLedger.list(scope);
  assert.equal(events.some((event) => event.type.startsWith("catch.") && event.sourceEntityId === duplicate.id), false);
  assert.equal(events.some((event) => event.type === "species.first" && event.sourceEntityId === duplicate.id), false);
  assert.equal(events.filter((event) => event.reasonKey === `verification.photo.claimed:${photoHash}`).length, 1);
});

test("a duplicate photo added later stays in the Catch while a new unique photo earns only one reward", async () => {
  const scope = await reset();
  const stamp = "2026-10-28T10:00:00.000Z";
  const duplicateBlob = new Blob(["already-rewarded photo"], { type: "image/jpeg" });
  const duplicateHash = await sha256Blob(duplicateBlob);
  const original = await catchRepository.put(record("original-photo-catch", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "commonCarp",
    photos: [{ id: "original-photo", type: "image/jpeg", blob: duplicateBlob, contentSha256: duplicateHash }],
    verification: { status: "verified", level: "standard", reason: "photo-capture-time", photoHash: duplicateHash,
      locationSource: "photo-exif", verifiedAt: stamp },
  }), scope);
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:00:00.000Z") });

  const secondBlob = new Blob(["same photo, second Catch"], { type: "image/jpeg" });
  const initiallyDuplicate = evaluateCatchVerification({
    photos: [{ id: "duplicate-again", type: "image/jpeg", blob: secondBlob, contentSha256: duplicateHash }],
    caughtAt: stamp, now: new Date("2026-10-28T12:01:00.000Z"), usedPhotoHashes: new Set([duplicateHash]),
  });
  assert.equal(initiallyDuplicate.reason, "photo-already-used");
  const secondCatch = await catchRepository.put(record("second-photo-catch", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "commonCarp",
    photos: [{ id: "duplicate-again", type: "image/jpeg", blob: secondBlob, contentSha256: duplicateHash }],
    verification: initiallyDuplicate,
  }), scope);
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:01:00.000Z") });
  assert.equal((await progressionLedger.list(scope)).some((event) => event.sourceEntityId === secondCatch.id && event.xp > 0), false);

  const uniqueBlob = new Blob(["new unique photo"], { type: "image/jpeg" });
  const uniqueHash = await sha256Blob(uniqueBlob);
  const photos = [...secondCatch.photos, { id: "new-unique-photo", type: "image/jpeg", blob: uniqueBlob, contentSha256: uniqueHash }];
  const verification = evaluateCatchVerification({
    photos, caughtAt: stamp, now: new Date("2026-10-28T12:02:00.000Z"), usedPhotoHashes: new Set([duplicateHash]),
  });
  assert.equal(verification.photoHash, uniqueHash);
  const edited = await catchRepository.put({
    ...secondCatch, photos, verification, updatedAt: "2026-10-28T12:02:00.000Z",
    sync: { ...secondCatch.sync, revision: 2 },
  }, scope);
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:02:00.000Z") });
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:03:00.000Z") });

  const events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.sourceEntityId === original.id && event.type.startsWith("catch.")).reduce((sum, event) => sum + event.xp, 0), 15);
  assert.equal(events.filter((event) => event.sourceEntityId === edited.id && event.type.startsWith("catch.")).reduce((sum, event) => sum + event.xp, 0), 4);
  assert.equal(edited.photos.length, 2, "duplicate photo can remain stored with the Catch");
});

test("a unique limited Catch earns reduced idempotent XP without progression rewards", async () => {
  const scope = await reset();
  const stamp = "2026-10-28T10:00:00.000Z";
  const blob = new Blob(["limited evidence"], { type: "image/jpeg" });
  const photoHash = await sha256Blob(blob);
  await catchRepository.put(record("limited-catch", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "carp", species: "Kapr obecný",
    photos: [{ id: "limited-photo", type: "image/jpeg", blob, contentSha256: photoHash }],
    verification: { status: "unverified", level: "limited", reason: "missing-trip-or-water-location", photoHash },
  }), scope);

  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:00:00.000Z") });
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:01:00.000Z") });
  const events = await progressionLedger.list(scope);
  const limitedXp = events.filter((event) => event.type === "catch.limited");
  assert.equal(limitedXp.length, 1);
  assert.equal(limitedXp[0].xp, 4);
  assert.equal(events.filter((event) => event.sourceEntityId === "limited-catch" && event.type.startsWith("catch.")).reduce((sum, event) => sum + event.xp, 0), 4);
  assert.equal(events.some((event) => ["species.first", "rarity.legendary", "achievement.unlocked", "mastery.milestone", "challenge.completed"].includes(event.type)), false);
  assert.equal(events.filter((event) => event.reasonKey === `verification.photo.claimed:${photoHash}`).length, 1);
});

test("limited-to-standard-to-strong verification upgrades award only the remaining Catch XP across edit, reload, and sync", async () => {
  const scope = await reset();
  const stamp = "2026-10-28T10:00:00.000Z";
  const now = new Date("2026-10-28T12:00:00.000Z");
  const water = { id: "upgrade-water", coordinates: { latitude: 50, longitude: 14 } };
  const blob = new Blob(["multi-step verification photo"], { type: "image/jpeg" });
  const photoHash = await sha256Blob(blob);
  const base = record("upgrade-catch", {
    createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: "commonCarp", waterId: water.id,
    coordinates: water.coordinates, gpsSource: "manual-map",
    conditions: { airTempC: 12, pressureHpa: 1012, windKmh: 4 },
    photos: [{ id: "upgrade-photo", type: "image/jpeg", blob, contentSha256: photoHash }],
  });
  const limitedVerification = evaluateCatchVerification({
    photos: base.photos, coordinates: base.coordinates, gpsSource: base.gpsSource,
    caughtAt: stamp, now,
  });
  assert.equal(limitedVerification.level, "limited");
  let stored = await catchRepository.put({ ...base, verification: limitedVerification }, scope);
  await progressionLedger.reconcile(scope, { now });
  const xpForCatch = (events) => events.filter((event) => event.sourceEntityId === stored.id && event.type.startsWith("catch."))
    .reduce((total, event) => total + event.xp, 0);
  assert.equal(xpForCatch(await progressionLedger.list(scope)), 5);

  const trip = await tripRepository.start({
    id: "completed-trip", title: "Ranní vycházka", startedAt: "2026-10-28T09:30:00.000Z",
  }, scope);
  await tripRepository.put({ ...trip, endedAt: "2026-10-28T10:30:00.000Z" }, scope);
  const trips = await tripRepository.list(scope);
  const standardVerification = evaluateCatchVerification({
    photos: stored.photos, tripId: "completed-trip", trips, caughtAt: stamp, now,
    coordinates: stored.coordinates, gpsSource: stored.gpsSource,
  });
  assert.equal(standardVerification.level, "standard");
  stored = await catchRepository.put({ ...stored, tripId: "completed-trip", verification: standardVerification,
    updatedAt: now.toISOString(), sync: { ...stored.sync, revision: 2 } }, scope);
  await progressionLedger.reconcile(scope, { now });
  assert.equal(xpForCatch(await progressionLedger.list(scope)), 20, "only the 15 XP shortfall is added to the earlier 5 XP");

  // Reopening the persisted ledger and receiving an acknowledged sync revision must not replay rewards.
  const afterReload = await progressionLedger.list(scope);
  stored = await catchRepository.put({ ...stored, sync: { status: "metadata-synced", revision: 3, serverRevision: 2 } }, scope);
  await progressionLedger.reconcile(scope, { now });
  assert.equal(xpForCatch(afterReload), 20);
  assert.equal(xpForCatch(await progressionLedger.list(scope)), 20);

  const photoWithExif = { ...stored.photos[0], captureMetadata: { capturedAt: stamp, coordinates: water.coordinates } };
  const strongVerification = evaluateCatchVerification({
    photos: [photoWithExif], water, tripId: stored.tripId, trips, caughtAt: stamp, now,
  });
  assert.equal(strongVerification.level, "strong");
  stored = await catchRepository.put({ ...stored, photos: [photoWithExif], verification: strongVerification,
    sync: { status: "metadata-synced", revision: 4, serverRevision: 3 } }, scope);
  await progressionLedger.reconcile(scope, { now });
  const finalEvents = await progressionLedger.list(scope);
  assert.equal(xpForCatch(finalEvents), 20, "Strong and Standard share the same full XP entitlement");
  assert.equal(finalEvents.filter((event) => event.sourceEntityId === stored.id && event.type === "catch.created").length, 1);
  assert.equal(finalEvents.filter((event) => event.sourceEntityId === stored.id && event.type === "catch.photo").length, 1);
  assert.equal(finalEvents.filter((event) => event.sourceEntityId === stored.id && event.type === "catch.context").length, 1);
});

test("a future-dated Catch is saved without XP and can earn its reward after its date arrives", async () => {
  const scope = await reset();
  const blob = new Blob(["future catch photo"], { type: "image/jpeg" });
  const photoHash = await sha256Blob(blob);
  const future = await catchRepository.put(record("future-limited", {
    createdAt: "2026-10-28T12:00:00.000Z", updatedAt: "2026-10-28T12:00:00.000Z",
    caughtAt: "2026-10-29T10:00:00.000Z", speciesKey: "commonCarp",
    photos: [{ id: "future-photo", type: "image/jpeg", blob, contentSha256: photoHash }],
    verification: { status: "unverified", level: "limited", reason: "missing-trip-or-water-location", photoHash },
  }), scope);
  assert.ok(future, "saving the Catch is still allowed");
  assert.equal((await catchRepository.list(scope)).length, 1);

  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:00:00.000Z") });
  assert.equal((await progressionLedger.list(scope)).some((event) => event.sourceEntityId === future.id && event.xp > 0), false);

  await progressionLedger.reconcile(scope, { now: new Date("2026-10-29T12:00:00.000Z") });
  const maturedEvents = (await progressionLedger.list(scope)).filter((event) => event.sourceEntityId === future.id);
  assert.equal(maturedEvents.find((event) => event.type === "catch.limited")?.xp, 4);
});

test("100 limited catches stay saved while unique-photo XP is deduplicated and capped at 20 per Prague day", async () => {
  const scope = await reset();
  const stamp = "2026-10-28T10:00:00.000Z";
  const records = [];
  const species = ["commonCarp", "northernPike", "europeanPerch", "zander", "rainbowTrout"]
    .map((key) => DEFAULT_SPECIES.find((item) => item.key === key)).filter(Boolean);
  for (let index = 0; index < 100; index += 1) {
    const blob = new Blob([`limited photo ${index}`], { type: "image/jpeg" });
    const photoHash = await sha256Blob(blob);
    const selectedSpecies = species[index % species.length];
    records.push(record(`limited-${index}`, {
      createdAt: stamp, updatedAt: stamp, caughtAt: stamp, speciesKey: selectedSpecies.key, species: selectedSpecies.label,
      weightKg: 25, weightSource: "manual", lengthCm: 100, waterId: `water-${index}`,
      photos: [{ id: `limited-photo-${index}`, type: "image/jpeg", blob, contentSha256: photoHash }],
      verification: { status: "unverified", level: "limited", reason: "missing-trip-or-water-location", photoHash },
    }));
  }
  const duplicate = { ...records[0], id: "limited-duplicate", photos: [{ ...records[0].photos[0], id: "duplicate-photo" }] };
  for (const item of [...records, duplicate]) await catchRepository.put(item, scope);
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-28T12:00:00.000Z") });
  const events = await progressionLedger.list(scope);
  const awards = events.filter((event) => event.type === "catch.limited");
  assert.equal(awards.length, 100);
  assert.equal(awards.reduce((sum, event) => sum + event.xp, 0), 20);
  assert.equal(awards.filter((event) => event.xp > 0).length, 5);
  assert.equal((await catchRepository.list(scope)).length, 101, "the cap never deletes Catch records");
  assert.equal(events.some((event) => ["species.first", "rarity.legendary", "achievement.unlocked", "mastery.milestone", "challenge.completed"].includes(event.type)), false);
  assert.equal(awards.some((event) => event.sourceEntityId === "limited-duplicate" && event.xp > 0), false);
  const share = await progressionLedger.awardPublicShare("limited-0", scope);
  assert.equal(share.eligible, false);
});

test("sharing an unverified Catch never awards public-share XP", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("share-unverified", {
    verification: { status: "unverified", reason: "missing-photo" },
  }), scope);
  const result = await progressionLedger.awardPublicShare(stored.id, scope);
  assert.equal(result.eligible, false);
  assert.equal(result.event, null);
  assert.equal((await progressionLedger.list(scope)).some((event) => event.type === "share.public"), false);
});

test("a photo whose IndexedDB readback failed cannot claim first-time verification XP", async () => {
  const scope = await reset();
  const blob = new Blob(["unreadable evidence"], { type: "image/jpeg" });
  const photoHash = await sha256Blob(blob);
  await catchRepository.put(record("photo-readback-failed", {
    photos: [{ id: "broken-evidence", type: "image/jpeg", blob, contentSha256: photoHash,
      localError: { code: "photo_local_blob_unreadable" } }],
    verification: { status: "verified", reason: "live-gps-active-trip", photoHash, locationSource: "live-gps",
      gpsAccuracyMeters: 10, verifiedAt: "2026-10-28T10:01:00.000Z" },
  }), scope);
  await progressionLedger.reconcile(scope);
  const events = await progressionLedger.list(scope);
  assert.equal(events.some((event) => event.type.startsWith("catch.")), false);
  assert.equal(events.some((event) => event.type === "verification.photo.claimed"), false);
});

test("reload, direct reward lookup, edit, and deletion never grant the same reward twice", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("durable", {
    coordinates: { latitude: 50, longitude: 14 }, conditions: { airTempC: 12 },
  }), scope);
  await progressionLedger.reconcile(scope);
  const first = await progressionLedger.list(scope);
  const firstSummary = buildLedgerProgressionSummary(first, [stored], []);
  const firstReward = buildCatchRewardFromLedger(first, stored.id, firstSummary);

  await catchRepository.put({ ...stored, notes: "edit", sync: { ...stored.sync, revision: 2 } }, scope);
  await progressionLedger.reconcile(scope);
  await progressionLedger.reconcile(scope);
  const afterReload = await progressionLedger.list(scope);
  const secondReward = buildCatchRewardFromLedger(afterReload, stored.id, buildLedgerProgressionSummary(afterReload, [stored], []));
  assert.equal(afterReload.reduce((sum, event) => sum + event.xp, 0), firstSummary.xp);
  assert.equal(secondReward.xp, firstReward.xp);
  assert.equal(afterReload.filter((event) => event.type === "catch.created").length, 1);
  assert.equal(afterReload.filter((event) => event.type === "catch.context").length, 1);

  await catchRepository.delete(stored.id, scope);
  const afterDelete = await progressionLedger.list(scope);
  const deletedSummary = buildLedgerProgressionSummary(afterDelete, [], []);
  assert.equal(deletedSummary.xp, firstSummary.xp);
  assert.equal(deletedSummary.achievements.find((item) => item.id === "first-catch").isCompleted, true);
  assert.equal(deletedSummary.mastery.find((item) => item.speciesKey === "carp").level, 1);
});

test("weight achievements stay unlocked after the qualifying Catch is edited below the threshold or deleted", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("weight-record", { weightKg: 10, weightSource: "manual" }), scope);
  await progressionLedger.reconcile(scope);

  const edited = await catchRepository.put({
    ...stored,
    weightKg: 0.5,
    sync: { ...stored.sync, revision: 2 },
  }, scope);
  await progressionLedger.reconcile(scope);
  let events = await progressionLedger.list(scope);
  let summary = buildLedgerProgressionSummary(events, [edited], []);
  assert.equal(summary.achievements.find((item) => item.id === "first-kilo").isCompleted, true);
  assert.equal(summary.achievements.find((item) => item.id === "trophy-catch").isCompleted, true);

  await catchRepository.delete(edited.id, scope);
  events = await progressionLedger.list(scope);
  summary = buildLedgerProgressionSummary(events, [], []);
  assert.equal(summary.achievements.find((item) => item.id === "first-kilo").isCompleted, true);
  assert.equal(summary.achievements.find((item) => item.id === "trophy-catch").isCompleted, true);
  assert.equal(events.filter((event) => event.reasonKey === "achievement.unlocked:trophy-catch").length, 1);
});

test("GPS with a moon phase alone does not earn the GPS and weather catch tier", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("moon-only", {
    coordinates: { latitude: 50, longitude: 14 }, conditions: { moonPhase: "full" },
  }), scope);

  await progressionLedger.reconcile(scope);
  const events = await progressionLedger.list(scope);

  assert.equal(events.some((event) => event.reasonKey === "catch.context:moon-only"), false);
  assert.equal(buildLedgerProgressionSummary(events, [stored], []).xpBreakdown.catchXp, 10);
});

test("free-text catch locations never award new-water XP; mastery, achievements and streak IDs stay one-time", async () => {
  const scope = await reset();
  const dates = [
    "2026-09-28T10:00:00.000Z", "2026-10-05T10:00:00.000Z",
    "2026-10-12T10:00:00.000Z", "2026-10-19T10:00:00.000Z",
  ];
  for (let index = 0; index < dates.length; index += 1) {
    await catchRepository.put(record(`streak-${index}`, {
      caughtAt: dates[index], speciesKey: index < 2 ? "carp" : `species-${index}`,
      species: index < 2 ? "Kapr" : `Druh ${index}`, locationName: "Labe",
    }), scope);
  }
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-19T12:00:00.000Z") });
  await progressionLedger.reconcile(scope, { now: new Date("2026-10-19T12:00:00.000Z") });
  const events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.type === "water.created").length, 0);
  assert.equal(events.some((event) => event.reasonKey === "water.first:labe"), false);
  assert.equal(events.filter((event) => event.reasonKey === "mastery.milestone:carp:1").length, 1);
  assert.equal(events.filter((event) => event.reasonKey === "achievement.unlocked:first-catch").length, 1);
  assert.equal(events.filter((event) => event.reasonKey === "streak.milestone:4").length, 1);
  assert.equal(new Set(events.filter((event) => event.type === "challenge.completed").map((event) => event.id)).size,
    events.filter((event) => event.type === "challenge.completed").length);
});

test("species mastery rewards and unlocked milestones survive deletion of their qualifying catches", async () => {
  const scope = await reset();
  const records = [];
  for (let index = 0; index < 20; index += 1) {
    records.push(await catchRepository.put(record(`mastery-catch-${index}`, {
      speciesKey: "stable-species-id", species: "Testovací druh",
    }), scope));
  }
  await progressionLedger.reconcile(scope);
  const beforeEvents = await progressionLedger.list(scope);
  const beforeSummary = buildLedgerProgressionSummary(beforeEvents, records, []);
  const beforeMastery = beforeSummary.mastery.find((item) => item.speciesKey === "stable-species-id");
  assert.equal(beforeMastery.level, 3);
  assert.equal(beforeMastery.progressCount, 20);
  assert.equal(beforeMastery.xp, 130);

  for (const recordToDelete of records) await catchRepository.delete(recordToDelete.id, scope);
  await progressionLedger.reconcile(scope);
  const afterEvents = await progressionLedger.list(scope);
  const afterSummary = buildLedgerProgressionSummary(afterEvents, [], []);
  const afterMastery = afterSummary.mastery.find((item) => item.speciesKey === "stable-species-id");
  assert.equal(afterSummary.xp, beforeSummary.xp);
  assert.equal(afterMastery.level, 3);
  assert.equal(afterMastery.progressCount, 20);
  assert.equal(afterMastery.catchCount, 0);
  assert.equal(afterMastery.nextLevelAt, 50);
  assert.equal(afterMastery.xp, 130);
  assert.equal(afterEvents.filter((event) => event.reasonKey === "mastery.milestone:stable-species-id:3").length, 1);
});

test("new-water XP uses its stable Water ID and is not duplicated by retry or rename", async () => {
  const scope = await reset();
  const water = { id: "water-stable-id", name: "Labe 24", createdAt: "2026-10-19T10:00:00.000Z" };
  await waterRepository.put(water, scope);
  const first = await progressionLedger.awardWater(water, scope);
  const retry = await progressionLedger.awardWater({ ...water, name: "Labe 25" }, scope);
  const events = await progressionLedger.list(scope);
  assert.equal(first.isNew, true);
  assert.equal(retry.isNew, false);
  assert.equal(events.filter((event) => event.reasonKey === "water.created:water-stable-id").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "water.created:water-stable-id").xp, 30);
});

test("legendary rarity and completed public share award persistent XP once", async () => {
  const scope = await reset();
  const legendary = await catchRepository.put(record("legendary-catch", {
    speciesKey: "commonCarp", weightKg: 20, weightSource: "manual",
  }), scope);
  await progressionLedger.reconcile(scope);
  await progressionLedger.reconcile(scope);
  let events = await progressionLedger.list(scope);
  assert.equal(events.filter((event) => event.reasonKey === "rarity.legendary:legendary-catch").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "rarity.legendary:legendary-catch").xp, 200);

  const firstShare = await progressionLedger.awardPublicShare(legendary.id, scope);
  const retryShare = await progressionLedger.awardPublicShare(legendary.id, scope);
  events = await progressionLedger.list(scope);
  assert.equal(firstShare.isNew, true);
  assert.equal(retryShare.isNew, false);
  assert.equal(events.filter((event) => event.reasonKey === "share.public:legendary-catch").length, 1);
  assert.equal(events.find((event) => event.reasonKey === "share.public:legendary-catch").xp, 10);
  assert.equal(buildLedgerProgressionSummary(events, [legendary], []).xpBreakdown.publicShareXp, 10);
});

test("streak freeze is scoped, persisted, and can be applied only once per Prague month", async () => {
  const scope = await reset();
  const now = new Date("2026-06-17T10:00:00.000Z");
  await assert.rejects(progressionLedger.useStreakFreeze(scope, { now }), /Zmrazení lze použít/);
  await catchRepository.put(record("freeze-week-one", { caughtAt: "2026-06-04T10:00:00.000Z" }), scope);
  await catchRepository.put(record("freeze-week-two", { caughtAt: "2026-06-11T10:00:00.000Z" }), scope);
  const first = await progressionLedger.useStreakFreeze(scope, { now });
  const retry = await progressionLedger.useStreakFreeze(scope, { now });
  assert.equal(first.isNew, true);
  assert.equal(retry.isNew, false);
  assert.equal(first.event.periodKey, "2026-06-15");
  assert.equal((await progressionLedger.list(scope)).filter((event) => event.type === "streak.freeze.used").length, 1);
  await progressionLedger.reconcile(scope, { now });
  const events = await progressionLedger.list(scope);
  const catches = await catchRepository.list(scope);
  assert.equal(progressionLedger.summary(events, catches, [], { now }).streak.weeks, 3);
});

test("the +50 XP streak bonus is recorded once when the seventh qualifying week is reached", async () => {
  const scope = await reset();
  const dates = ["2026-05-06", "2026-05-13", "2026-05-20", "2026-05-27", "2026-06-03", "2026-06-10", "2026-06-17"];
  for (const [index, date] of dates.entries()) {
    await catchRepository.put(record(`bonus-week-${index}`, { caughtAt: `${date}T10:00:00.000Z` }), scope);
  }
  const now = new Date("2026-06-17T12:00:00.000Z");
  await progressionLedger.reconcile(scope, { now });
  await progressionLedger.reconcile(scope, { now });
  const bonusEvents = (await progressionLedger.list(scope)).filter((event) => event.reasonKey === "streak.bonus:7");
  assert.equal(bonusEvents.length, 1);
  assert.equal(bonusEvents[0].xp, 50);
});

test("every screen selector receives the same ledger XP, level, rank, and progress", () => {
  const events = [
    { type: "catch.created", reasonKey: "catch.created:a", xp: 10 },
    { type: "species.first", reasonKey: "species.first:carp", xp: 50 },
    { type: "achievement.unlocked", reasonKey: "achievement.unlocked:first-catch", xp: 30 },
  ];
  const summaries = Array.from({ length: 4 }, () => buildLedgerProgressionSummary(events, [], []));
  for (const summary of summaries.slice(1)) {
    assert.deepEqual(
      { xp: summary.xp, level: summary.level, rank: summary.rank, progressPercent: summary.progressPercent },
      { xp: summaries[0].xp, level: summaries[0].level, rank: summaries[0].rank, progressPercent: summaries[0].progressPercent },
    );
  }
});

test("ledger level and rank transitions match every requested boundary", () => {
  for (const [lastLevel, nextLevel, rankBefore, rankAfter] of [
    [5, 6, "Nováček", "Rybář"],
    [15, 16, "Rybář", "Zkušený rybář"],
    [29, 30, "Zkušený rybář", "Senior rybář"],
    [49, 50, "Senior rybář", "Expert"],
    [74, 75, "Expert", "Legenda"],
    [99, 100, "Legenda", "Prestige I+"],
  ]) {
    const beforeTransition = summaryForXp(xpForLevel(nextLevel) - 1);
    const afterTransition = summaryForXp(xpForLevel(nextLevel));
    assert.equal(beforeTransition.level, lastLevel);
    assert.equal(beforeTransition.rank.name, rankBefore);
    assert.equal(afterTransition.level, nextLevel);
    assert.equal(afterTransition.rank.name, rankAfter);
  }
});

test("catch reward event IDs can be presented only once in a browser session", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-a", "event-b"], storage), ["event-a", "event-b"]);
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-a", "event-b"], storage), []);
  assert.deepEqual(claimCatchRewardEventIds("catch-a", ["event-c"], storage), ["event-c"]);
  assert.deepEqual(claimCatchRewardEventIds("catch-direct", undefined, storage), []);
});

test("catch reward event IDs are recovered from the ledger when another reconciliation created them", () => {
  const events = [
    { id: "create-1", sourceEntityType: "catch", sourceEntityId: "catch-a" },
    { id: "species-1", sourceEntityType: "catch", sourceEntityId: "catch-a" },
    { id: "create-2", sourceEntityType: "catch", sourceEntityId: "catch-b" },
  ];
  assert.deepEqual(getCatchRewardEventIds(events, "catch-a"), ["create-1", "species-1"]);
});

test("a saved catch carries its ledger event IDs into the reward calculation", async () => {
  const scope = await reset();
  const stored = await catchRepository.put(record("reward-catch"), scope);
  const reconciled = await progressionLedger.reconcile(scope);
  const eventIds = getCatchRewardEventIds(reconciled.events, stored.id);
  const summary = buildLedgerProgressionSummary(reconciled.events, [stored], []);
  const reward = buildCatchRewardFromLedger(reconciled.events, stored.id, summary, eventIds);

  assert.ok(eventIds.length > 0);
  assert.equal(reward.breakdown.catchXp, 10);
  assert.equal(reward.breakdown.speciesXp, 50);
});

test("a marathon achievement is attributed to its qualifying Trip instead of an unrelated Catch", async () => {
  const scope = await reset();
  await catchRepository.put(record("unrelated-catch"), scope);
  const trip = await tripRepository.start({
    id: "marathon-trip-source",
    title: "Noční výprava",
    startedAt: "2026-10-18T18:00:00.000Z",
  }, scope);
  await tripRepository.put({ ...trip, endedAt: "2026-10-19T03:00:00.000Z" }, scope);

  await progressionLedger.reconcile(scope);
  const event = (await progressionLedger.list(scope))
    .find((item) => item.reasonKey === "achievement.unlocked:marathon-trip");

  assert.equal(event.sourceEntityType, "trip");
  assert.equal(event.sourceEntityId, "marathon-trip-source");
  assert.equal(event.occurredAt, "2026-10-19T03:00:00.000Z");
});
