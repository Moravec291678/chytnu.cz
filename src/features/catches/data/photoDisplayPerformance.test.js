import assert from "node:assert/strict";
import test from "node:test";
import { accountScopeKey } from "../../auth/data/localDataScope.js";
import { createPhotoCloudService } from "./photoCloudService.js";
import { sha256Blob } from "./photoCloudProvider.js";

test("cold consumers share one download; warm lookup reads one binary and version changes invalidate cache", async () => {
  const ownerId = "display-owner", catchId = "display-catch", photoId = "display-photo";
  const scope = { ownerId, scopeKey: accountScopeKey(ownerId) };
  let source = new Blob(["first-version"], { type: "image/jpeg" });
  const cloud = { state: "synced", provider: "fake", objectKey: "private/key", sha256: await sha256Blob(source) };
  let photo = { id: photoId, size: source.size, type: source.type, cloud };
  let cached;
  let downloads = 0, binaryReads = 0, metadataReads = 0;
  const service = createPhotoCloudService({
    getCurrentOwnerId: () => ownerId,
    catches: {
      get() { assert.fail("one image must not hydrate all catch binaries"); },
      getPhotoForDisplay: async () => { binaryReads++; return { ...photo, blob: cached }; },
      getMetadata: async () => { metadataReads++; return { photos: [photo] }; },
      setPhotoLocalError: async () => {},
      cachePhotoBlob: async (_catch, _photo, blob, options) => {
        assert.equal(options.expectedPhotoCloud.sha256, photo.cloud.sha256);
        cached = blob; return blob;
      },
    },
    provider: { id: "fake", download: async () => { downloads++; return source; } },
  });
  const load = () => service.getPhotoBlob({ photo: { ...photo }, catchId, ...scope });
  const first = await Promise.all([load(), load(), load()]);
  assert.equal(first[0], first[1]);
  assert.equal(first[1], first[2]);
  assert.deepEqual([downloads, binaryReads, metadataReads], [1, 1, 1]);
  assert.equal(await (await load()).text(), "first-version");
  assert.equal(downloads, 1);
  source = new Blob(["next-version!"], { type: "image/jpeg" });
  photo = { ...photo, cloud: { ...cloud, sha256: await sha256Blob(source) } };
  assert.equal(await (await load()).text(), "next-version!");
  assert.equal(downloads, 2, "old bytes must not satisfy new metadata even for an equal length");
});

test("verified warm Blob needs only one byte read and no database or network request", async () => {
  const ownerId = "display-owner";
  const blob = new Blob(["cached"], { type: "image/jpeg" });
  const hash = await sha256Blob(blob);
  let reads = 0;
  const read = blob.arrayBuffer.bind(blob);
  blob.arrayBuffer = () => { reads++; return read(); };
  const service = createPhotoCloudService({ getCurrentOwnerId: () => ownerId,
    catches: { get() { assert.fail("unexpected database read"); } }, provider: { id: "fake", download() { assert.fail("unexpected download"); } } });
  const result = await service.getPhotoBlob({ ownerId, scopeKey: accountScopeKey(ownerId), catchId: "c",
    photo: { id: "p", blob, cloud: { state: "synced", provider: "fake", sha256: hash, objectKey: "key" } } });
  assert.equal(result, blob);
  assert.equal(reads, 1);
});

test("a PC with metadata only and no upload job displays and caches the recovered Cloudinary original", async () => {
  const ownerId = "pc-owner", catchId = "catch";
  const photo = { id: "photo", cloud: { state: "localOnly" }, size: 4, type: "image/png" };
  const blob = new Blob(["test"], { type: photo.type });
  let cached;
  const service = createPhotoCloudService({ provider: { id: "cloudinary" }, getCurrentOwnerId: () => ownerId,
    authenticatedRequest: async (path, body) => {
      assert.equal(path, "/api/cloudinary/export");
      assert.deepEqual(body, { catchId, photoId: photo.id, recoverAtRevision: 7 }); return blob;
    },
    catches: { getPhotoForDisplay: async () => ({ ...photo, blob: cached }),
      getMetadata: async () => ({ sync: { status: "metadata-synced", serverRevision: 7 } }),
      cachePhotoBlob: async (_c, _p, bytes, options) => {
        assert.equal(options.expectedServerRevision, 7);
        assert.equal(options.recoveredCloud.sha256, await sha256Blob(blob));
        cached = bytes; return bytes;
      } },
  });
  const args = { ownerId, scopeKey: accountScopeKey(ownerId), catchId, photo };
  assert.equal(await service.getPhotoBlob(args), blob);
  assert.equal(await service.getPhotoBlob(args), blob);
});
