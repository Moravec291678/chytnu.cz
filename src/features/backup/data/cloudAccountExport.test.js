import test from "node:test";
import assert from "node:assert/strict";
import { createCloudAccountExportService, CLOUD_ACCOUNT_EXPORT_FORMAT, CLOUD_ACCOUNT_EXPORT_VERSION } from "./cloudAccountExport.js";
import { LOCAL_BACKUP_FORMAT } from "./backupFormat.js";

const OWNER = "account-a";
const makeItem = (id, data) => ({ id, data: { id, ownerId: OWNER, ...data } });
const emptyNames = ["trips", "waters", "notifications", "serverProgressionEvents", "serverProgressionState"];

test("account cloud export remains a distinct format from the existing local backup", () => {
  assert.equal(CLOUD_ACCOUNT_EXPORT_FORMAT, "chytnucz-account-export");
  assert.notEqual(CLOUD_ACCOUNT_EXPORT_FORMAT, LOCAL_BACKUP_FORMAT);
});

test("complete owner export includes Catch, trip, custom Water, notification, progression and photo metadata", async () => {
  const bytes = new Uint8Array([3, 1, 4]);
  const hash = await photoHash(bytes);
  const server = {
    catches: [makeItem("catch-complete", {
      species: "Kapr", speciesKey: "commonCarp", lengthCm: 82, weightKg: 7.4,
      caughtAt: "2026-10-20T10:00:00.000Z", tripId: "trip-owner", waterId: "water-owner",
      coordinates: { latitude: 50.1, longitude: 14.4 },
      privacy: { visibility: "private", photoVisibility: "private", locationPrecision: "none", privateSpot: true,
        nearbyEligible: false, heatmapEligible: false },
      verification: { status: "verified", level: "standard", photoHash: hash, verifiedAt: "2026-10-20T10:00:00.000Z" },
      conditions: { airTempC: 12, weather: "cloudy" }, photoRefs: { photo: true }, primaryPhotoId: "photo",
    })],
    "catches/catch-complete/photos": [{ id: "photo", data: { id: "photo", name: "fish.jpg", type: "image/jpeg",
      size: bytes.length, focalX: 0.4, focalY: 0.6, zoom: 1.2, sortIndex: 0,
      cloud: { state: "synced", provider: "cloudinary", objectKey: "owner-only-cloud-path", sha256: hash } } }],
    trips: [makeItem("trip-owner", { title: "Ranní vycházka", startedAt: "2026-10-20T06:00:00.000Z", endedAt: "2026-10-20T12:00:00.000Z" })],
    waters: [makeItem("water-owner", { name: "Moje voda", type: "Řeka", notes: "Vlastní poznámka" })],
    notifications: [makeItem("notice-owner", { type: "achievement", title: "Úspěch", body: "Odemčen.",
      createdAt: "2026-10-20T12:00:00.000Z", readAt: null, deepLink: "/achievements" })],
    serverProgressionEvents: [makeItem("event-owner", { eventId: "event-owner", catchId: "catch-complete",
      type: "catch.created", xp: 8, verificationLevel: "standard", createdAt: "2026-10-20T12:01:00.000Z" })],
    serverProgressionState: [makeItem("summary", { legacyBaselineXp: 50 })],
  };
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName }) => ({ items: server[collectionName] ?? [], cursor: null, done: true }),
    currentOwnerId: () => OWNER,
    downloadPhoto: async ({ ownerId, catchId, photoId }) => {
      assert.deepEqual({ ownerId, catchId, photoId }, { ownerId: OWNER, catchId: "catch-complete", photoId: "photo" });
      return bytes;
    },
  });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.version, 1);
  assert.equal(result.records.catches[0].tripId, "trip-owner");
  assert.equal(result.records.catches[0].waterId, "water-owner");
  assert.equal(result.records.catches[0].lengthCm, 82);
  assert.equal(result.records.catches[0].verification.level, "standard");
  assert.equal(result.records.catches[0].photos[0].focalX, 0.4);
  assert.equal(result.records.catches[0].photos[0].dataBase64, "AwEE");
  assert.equal(result.records.trips[0].id, "trip-owner");
  assert.equal(result.records.waters[0].name, "Moje voda");
  assert.equal(result.records.notifications[0].id, "notice-owner");
  assert.equal(result.records.progression.events[0].xp, 8);
});

test("account export allowlists Firebase account fields and never serializes auth tokens or credentials", async () => {
  const service = createCloudAccountExportService({
    getCollectionPage: async () => ({ items: [], cursor: null, done: true }),
    currentOwnerId: () => OWNER,
    downloadPhoto: async () => assert.fail("empty account has no photos"),
  });
  const result = await service.exportAccount({ ownerId: OWNER, user: {
    uid: OWNER, email: "angler@example.test", displayName: "Rybář", emailVerified: true,
    metadata: { creationTime: "2026-01-01T00:00:00Z", lastSignInTime: "2026-10-20T00:00:00Z" },
    accessToken: "test-access-token", idToken: "test-id-token", refreshToken: "test-refresh-token",
    apiKey: "test-api-key", serviceAccount: { private_key: "test-private-key" },
    providerData: [{ providerId: "google.com", email: "angler@example.test", displayName: "Rybář",
      accessToken: "provider-access-token", refreshToken: "provider-refresh-token", secret: "provider-secret" }],
  } });
  const serialized = JSON.stringify(result);
  for (const secret of ["test-access-token", "test-id-token", "test-refresh-token", "test-api-key", "test-private-key",
    "provider-access-token", "provider-refresh-token", "provider-secret"]) {
    assert.equal(serialized.includes(secret), false, `${secret} must not be exported`);
  }
  assert.deepEqual(result.account.providers, [{ providerId: "google.com", email: "angler@example.test", displayName: "Rybář" }]);
  assert.equal(result.account.createdAt, "2026-01-01T00:00:00Z");
});

async function photoHash(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

test("cloud account export reads owner records, server progression and Cloudinary photo bytes", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const hash = await photoHash(bytes);
  const requested = [];
  const getCollectionPage = async ({ collectionName, cursor }) => {
    requested.push(collectionName);
    if (collectionName === "catches" && !cursor) return {
      items: [makeItem("catch-1", { species: "Kapr", photoRefs: { "photo-1": true }, primaryPhotoId: "photo-1" })],
      cursor: "page-1", done: true,
    };
    if (collectionName === "catches/catch-1/photos") return {
      items: [{ id: "photo-1", data: { id: "photo-1", name: "kapr.jpg", type: "image/jpeg", size: bytes.length,
        cloud: { state: "synced", provider: "cloudinary", sha256: hash } } }], cursor: null, done: true,
    };
    if (emptyNames.includes(collectionName)) return { items: [], cursor: null, done: true };
    throw new Error(`Unexpected collection ${collectionName}`);
  };
  const service = createCloudAccountExportService({
    getCollectionPage,
    currentOwnerId: () => OWNER,
    downloadPhoto: async ({ ownerId, catchId, photoId }) => {
      assert.equal(ownerId, OWNER);
      assert.equal(catchId, "catch-1");
      assert.equal(photoId, "photo-1");
      return bytes;
    },
    now: () => new Date("2026-10-28T10:00:00.000Z"),
  });

  const result = await service.exportAccount({ ownerId: OWNER, email: "angler@example.test" });
  assert.equal(result.format, CLOUD_ACCOUNT_EXPORT_FORMAT);
  assert.equal(result.version, CLOUD_ACCOUNT_EXPORT_VERSION);
  assert.equal(result.formatVersion, CLOUD_ACCOUNT_EXPORT_VERSION);
  assert.equal(result.generatedAt, "2026-10-28T10:00:00.000Z");
  assert.equal(result.account.uid, OWNER);
  assert.equal(result.records.catches[0].photos[0].dataBase64, "AQIDBA==");
  assert.equal(result.records.catches[0].photos[0].availability, "included");
  assert.equal(result.records.catches[0].photoRefs, undefined);
  assert.equal(result.records.catches[0].primaryPhotoId, "photo-1");
  assert.deepEqual(requested, ["catches", ...emptyNames, "catches/catch-1/photos"]);
});

test("cross-device export contains server Catch, Water and Photo absent from the current device", async () => {
  const bytes = new Uint8Array([9, 8, 7, 6]);
  const hash = await photoHash(bytes);
  const serverReads = [];
  const serverCollections = {
    catches: [
      makeItem("catch-a", { species: "Kapr", photoRefs: {}, caughtAt: "2026-10-20T10:00:00.000Z" }),
      makeItem("catch-b", { species: "Štika", waterId: "water-x", photoRefs: { "photo-x": true }, primaryPhotoId: "photo-x", caughtAt: "2026-10-21T10:00:00.000Z" }),
    ],
    waters: [makeItem("water-x", { name: "Voda X", type: "Řeka", coordinates: { latitude: 50, longitude: 14 } })],
  };
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName }) => {
      serverReads.push(collectionName);
      if (collectionName === "catches" || collectionName === "waters") {
        return { items: serverCollections[collectionName], cursor: null, done: true };
      }
      if (collectionName === "catches/catch-b/photos") return { items: [{ id: "photo-x", data: {
        id: "photo-x", name: "photo-x.jpg", type: "image/jpeg", size: bytes.length, deleted: false,
        cloud: { state: "synced", provider: "cloudinary", objectKey: "owner-private-path", sha256: hash },
      } }], cursor: null, done: true };
      return { items: [], cursor: null, done: true };
    },
    currentOwnerId: () => OWNER,
    downloadPhoto: async ({ catchId, photoId }) => {
      assert.equal(catchId, "catch-b");
      assert.equal(photoId, "photo-x");
      return bytes;
    },
  });

  // The current device's local state has Catch A only; cloud reads are the export source.
  const result = await service.exportAccount({ ownerId: OWNER, deviceSupplement: { source: "current-device", localCatchIds: ["catch-a"] } });
  assert.deepEqual(result.records.catches.map((record) => record.id), ["catch-a", "catch-b"]);
  assert.equal(result.records.waters[0].id, "water-x");
  assert.equal(result.records.catches[1].waterId, "water-x");
  assert.equal(result.records.catches[1].photos[0].availability, "included");
  assert.equal(result.records.catches[1].photos[0].dataBase64, "CQgHBg==");
  assert.ok(serverReads.includes("catches") && serverReads.includes("waters"));
});

test("cloud export reports user progression and separates current-device profile data", async () => {
  const page = async ({ collectionName }) => {
    if (collectionName === "catches") return { items: [makeItem("catch-progress", {
      species: "Kapr", speciesKey: "commonCarp", caughtAt: "2026-10-27T12:00:00.000Z", lengthCm: 82,
      weightKg: 7.4, photoRefs: {},
    })], cursor: null, done: true };
    if (collectionName === "serverProgressionEvents") return { items: [makeItem("catch-created-catch-progress", {
      xp: 8, type: "catch.created",
    })], cursor: null, done: true };
    if (collectionName === "serverProgressionState") return { items: [makeItem("summary", { legacyBaselineXp: 100 })], cursor: null, done: true };
    return { items: [], cursor: null, done: true };
  };
  const service = createCloudAccountExportService({ getCollectionPage: page, currentOwnerId: () => OWNER,
    downloadPhoto: async () => new Uint8Array(), now: () => new Date("2026-10-28T10:00:00.000Z") });
  const deviceSupplement = { source: "current-device-profile-scope", preferences: { general: { detailMode: "simple" } },
    privacySettings: { defaultCatchVisibility: "private" }, progressionEvents: [{ reasonKey: "achievement.unlocked:first-catch", xp: 10 }] };
  const result = await service.exportAccount({ ownerId: OWNER, deviceSupplement });
  assert.equal(result.records.progression.totalXp, 108);
  assert.equal(result.records.progression.level, 2);
  assert.equal(result.records.progression.cloudDerived.achievements.some((item) => item.id === "first-catch"), true);
  assert.equal(result.records.deviceLocal.preferences.general.detailMode, "simple");
  assert.equal(result.records.deviceLocal.privacySettings.defaultCatchVisibility, "private");
  assert.equal(result.records.deviceLocal.progressionEvents[0].reasonKey, undefined);
  assert.equal(Object.hasOwn(result.records.deviceLocal, "pendingProgressionClaims"), false);
  assert.equal(result.records.catches[0].lengthCm, 82);
  assert.equal(result.account.uid, OWNER);
  assert.equal(Object.hasOwn(result.account, "token"), false);
});

test("portable account export excludes subscription credentials and internal anti-cheat hashes/counters", async () => {
  const page = async ({ collectionName }) => {
    if (collectionName === "catches") return { items: [makeItem("catch-internal", {
      serverRevision: 4, operationDigest: "private-operation-digest", lastOperationId: "internal-operation",
      verification: { status: "verified", level: "standard", photoHash: "private-photo-hash", verifiedAt: "2026-10-27T12:00:00Z" },
      photoRefs: {},
    })], cursor: null, done: true };
    if (collectionName === "notifications") return { items: [makeItem("notice", {
      title: "Výzva", type: "challenge", body: "Splněna", createdAt: "2026-10-27", readAt: null,
      deepLink: "/challenges", installationId: "internal-installation",
    })], cursor: null, done: true };
    if (collectionName === "serverProgressionEvents") return { items: [makeItem("server-event", {
      eventId: "server-event", catchId: "catch-internal", type: "catch.created", xp: 10, verificationLevel: "standard",
      photoHash: "internal-secret-hash", source: "server-shadow", createdAt: "2026-10-27",
    })], cursor: null, done: true };
    return { items: [], cursor: null, done: true };
  };
  const service = createCloudAccountExportService({ getCollectionPage: page, currentOwnerId: () => OWNER,
    downloadPhoto: async () => new Uint8Array() });
  const result = await service.exportAccount({ ownerId: OWNER });
  const text = JSON.stringify(result);
  assert.doesNotMatch(text, /private-operation-digest|internal-operation|private-photo-hash|internal-secret-hash|server-shadow|installationId|pushSubscriptions|photoClaims|dailyCaps/);
  assert.equal(result.records.catches[0].verification.level, "standard");
  assert.equal(result.records.catches[0].verification.photoHash, undefined);
  assert.deepEqual(result.records.progression.events[0], {
    id: "server-event", eventId: "server-event", catchId: "catch-internal", type: "catch.created", xp: 10,
    verificationLevel: "standard", createdAt: "2026-10-27",
  });
  assert.equal(result.records.notifications[0].installationId, undefined);
});

test("cloud export records photos absent from cloud without pretending to contain their bytes", async () => {
  const page = async ({ collectionName }) => {
    if (collectionName === "catches") return { items: [makeItem("catch-local-photo", {
      photoRefs: { p1: true }, photos: [],
    })], cursor: null, done: true };
    if (collectionName === "catches/catch-local-photo/photos") return { items: [{ id: "p1", data: {
      id: "p1", name: "local.jpg", type: "image/jpeg", size: 100,
      cloud: { state: "localOnly", provider: null, objectKey: null, sha256: null },
    } }], cursor: null, done: true };
    return { items: [], cursor: null, done: true };
  };
  const service = createCloudAccountExportService({ getCollectionPage: page, currentOwnerId: () => OWNER,
    downloadPhoto: async () => assert.fail("local-only binary cannot be downloaded from cloud") });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.records.catches[0].photos[0].dataBase64, null);
  assert.equal(result.records.catches[0].photos[0].availability, "not-stored-in-cloud");
  assert.equal(result.coverage.warningCount, 1);
});

test("cloud export preserves active photo metadata that is not linked from the Catch", async () => {
  const page = async ({ collectionName }) => {
    if (collectionName === "catches") return { items: [makeItem("catch-orphan-photo", { photoRefs: {} })], cursor: null, done: true };
    if (collectionName === "catches/catch-orphan-photo/photos") return { items: [{ id: "orphan", data: {
      id: "orphan", name: "orphan.jpg", type: "image/jpeg", size: 100, deleted: false,
      cloud: { state: "synced", provider: "cloudinary", sha256: "a".repeat(64) },
    } }], cursor: null, done: true };
    return { items: [], cursor: null, done: true };
  };
  const service = createCloudAccountExportService({ getCollectionPage: page, currentOwnerId: () => OWNER,
    downloadPhoto: async () => assert.fail("unlinked photos cannot be downloaded as active Catch photos") });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.records.catches[0].photos[0].availability, "not-linked-to-catch");
  assert.equal(result.records.catches[0].photos[0].dataBase64, null);
  assert.equal(result.warnings[0].reason, "photo_not_linked_to_catch");
});

test("cloud export rejects records whose owner or document identity does not match", async () => {
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName }) => collectionName === "catches"
      ? { items: [{ id: "foreign", data: { id: "foreign", ownerId: "account-b" } }], cursor: null, done: true }
      : { items: [], cursor: null, done: true },
    currentOwnerId: () => OWNER,
    downloadPhoto: async () => new Uint8Array(),
  });
  await assert.rejects(service.exportAccount({ ownerId: OWNER }), /nemá platného vlastníka/);
});

test("cloud export aborts if the authenticated account changes during pagination", async () => {
  let activeOwner = OWNER;
  const service = createCloudAccountExportService({
    getCollectionPage: async () => {
      activeOwner = "account-b";
      return { items: [], cursor: null, done: true };
    },
    currentOwnerId: () => activeOwner,
    downloadPhoto: async () => new Uint8Array(),
  });
  await assert.rejects(service.exportAccount({ ownerId: OWNER }), /účet se změnil/);
});

test("cloud export safely paginates complete collections until an empty final page", async () => {
  let catchPage = 0;
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName, cursor, pageSize }) => {
      if (collectionName !== "catches") return { items: [], cursor: null, done: true };
      assert.equal(pageSize, 2);
      catchPage += 1;
      if (catchPage === 1) return { items: [makeItem("c1", {}), makeItem("c2", {})], cursor: "c2", done: false };
      assert.equal(cursor, "c2");
      return { items: [], cursor: "c2", done: true };
    },
    currentOwnerId: () => OWNER,
    downloadPhoto: async () => new Uint8Array(),
    pageSize: 2,
  });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.records.catches.length, 2);
  assert.equal(catchPage, 2);
});

test("size audit: empty account exports successfully with no Catch, Water or photos", async () => {
  const service = createCloudAccountExportService({ getCollectionPage: async () => ({ items: [], cursor: null, done: true }),
    currentOwnerId: () => OWNER, downloadPhoto: async () => assert.fail("empty account has no photos") });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.coverage.catches, 0);
  assert.equal(result.coverage.trips, 0);
  assert.equal(result.coverage.waters, 0);
  assert.equal(result.coverage.photos, 0);
  assert.deepEqual(result.records.catches, []);
  assert.deepEqual(result.records.waters, []);
});

test("size audit: 100 Catch are exported across pages without a total-record cap", async () => {
  const records = Array.from({ length: 100 }, (_, index) => makeItem(`catch-${String(index).padStart(3, "0")}`, {
    species: "Kapr", caughtAt: "2026-10-20T10:00:00.000Z", photoRefs: {},
  }));
  let pageCount = 0;
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName, cursor, pageSize }) => {
      if (collectionName !== "catches") return { items: [], cursor: null, done: true };
      pageCount += 1;
      const start = cursor ? records.findIndex((item) => item.id === cursor) + 1 : 0;
      const items = records.slice(start, start + pageSize);
      return { items, cursor: items.at(-1)?.id ?? cursor, done: start + items.length >= records.length };
    },
    currentOwnerId: () => OWNER,
    downloadPhoto: async () => assert.fail("these Catch have no photos"),
    pageSize: 17,
  });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(result.records.catches.length, 100);
  assert.equal(pageCount, 6);
});

test("size audit: many photos and a legacy Catch with more than four photos export completely", async () => {
  const bytes = new Uint8Array([5, 4, 3]);
  const hash = await photoHash(bytes);
  const allCatchRecords = Array.from({ length: 12 }, (_, catchIndex) => {
    const photos = Array.from({ length: 10 }, (_, photoIndex) => ({
      id: `photo-${catchIndex}-${photoIndex}`, name: `photo-${catchIndex}-${photoIndex}.jpg`,
      type: "image/jpeg", size: bytes.length,
      cloud: { state: "synced", provider: "cloudinary", objectKey: "internal", sha256: hash },
    }));
    return makeItem(`legacy-catch-${catchIndex}`, {
      species: "Kapr", caughtAt: "2026-10-20T10:00:00.000Z", photos,
      ...(catchIndex === 0 ? {} : { photoRefs: Object.fromEntries(photos.map(({ id }) => [id, true])) }),
    });
  });
  let downloaded = 0;
  const service = createCloudAccountExportService({
    getCollectionPage: async ({ collectionName }) => collectionName === "catches"
      ? { items: allCatchRecords, cursor: null, done: true }
      : { items: [], cursor: null, done: true },
    currentOwnerId: () => OWNER,
    downloadPhoto: async () => { downloaded += 1; return bytes; },
  });
  const result = await service.exportAccount({ ownerId: OWNER });
  assert.equal(downloaded, 120);
  assert.equal(result.coverage.photos, 120);
  assert.equal(result.records.catches[0].photos.length, 10, "legacy >4-photo Catch remain complete");
  assert.ok(result.records.catches.every((record) => record.photos.length === 10));
});
