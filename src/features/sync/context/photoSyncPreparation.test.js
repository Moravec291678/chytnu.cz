import assert from "node:assert/strict";
import test from "node:test";
import { preparePhotoSyncService } from "./photoSyncPreparation.js";

test("photo service exists before legacy photo normalization begins", async () => {
  const events = [];
  const serviceRef = { current: null };
  const providerRef = { current: null };
  const provider = { id: "cloudinary" };
  const service = {
    async normalizeLegacyPhotoIds(ownerId) {
      assert.equal(serviceRef.current, service, "normalization must never run on a null service ref");
      assert.equal(ownerId, "account-a");
      events.push("normalize");
    },
  };
  const prepared = await preparePhotoSyncService({ serviceRef, providerRef, provider, ownerId: "account-a",
    createService: (activeProvider) => { assert.equal(activeProvider, provider); events.push("create"); return service; } });
  assert.equal(prepared, service);
  assert.deepEqual(events, ["create", "normalize"]);
});

test("photo service is recreated when the provider changes", async () => {
  const serviceRef = { current: { normalizeLegacyPhotoIds: async () => {} } };
  const providerRef = { current: { id: "old" } };
  const provider = { id: "cloudinary" };
  const nextService = { normalizeLegacyPhotoIds: async () => {} };
  const prepared = await preparePhotoSyncService({ serviceRef, providerRef, provider, ownerId: "account-a",
    createService: () => nextService });
  assert.equal(prepared, nextService);
  assert.equal(providerRef.current, provider);
});
