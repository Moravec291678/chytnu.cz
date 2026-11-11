import { Buffer } from "node:buffer";
import { getCloudinarySdk, cloudinaryPublicId } from "../../../server/cloudinaryApi.js";
import { stripJpegMetadata } from "../../ai/server/productionSpeciesApi.js";
import { socialUid } from "../data/socialModel.js";

export const MAX_SOCIAL_PHOTO_BYTES = 1_500_000;
export const SOCIAL_PHOTO_EDGE = 1280;
export const SOCIAL_PHOTO_TRANSFORMATION_VERSION = 1;
const transformation = Object.freeze({ width: SOCIAL_PHOTO_EDGE, height: SOCIAL_PHOTO_EDGE, crop: "limit", quality: 80, flags: "strip_profile" });
const transformationPath = "c_limit,fl_strip_profile,h_1280,q_80,w_1280";
const unavailable = () => Object.assign(new Error("photo_unavailable"), { code: "photo_unavailable", status: 503 });
const invalid = () => Object.assign(new Error("invalid_shared_photo"), { code: "invalid_shared_photo", status: 400 });
const dimensionsValid = item => Number.isSafeInteger(item?.width) && Number.isSafeInteger(item?.height)
  && item.width > 0 && item.height > 0 && item.width <= SOCIAL_PHOTO_EDGE && item.height <= SOCIAL_PHOTO_EDGE;

function sourceIdentity({ uid, catchId, photoId }, photo) {
  socialUid(uid); socialUid(catchId); socialUid(photoId);
  const publicId = cloudinaryPublicId(uid, catchId, photoId);
  // Current sync metadata has no ownerId: ownership is the authenticated parent
  // path plus its owner, and the exact owner-bound Cloudinary object key below.
  // Keep rejecting contradictory legacy metadata instead of trusting that field.
  if (!photo || photo.ownerId !== undefined && photo.ownerId !== uid || photo.deleted || photo.id !== undefined && photo.id !== photoId
    || photo.type !== "image/jpeg" || !Number.isSafeInteger(photo.size) || photo.size < 1
    || photo.cloud?.provider !== "cloudinary" || photo.cloud.state !== "synced"
    || photo.cloud.objectKey !== `users/${uid}/catches/${catchId}/photos/${photoId}/original`
    || !/^[a-f0-9]{64}$/.test(photo.cloud.sha256 ?? "")) throw invalid();
  return publicId;
}

// Validate the actual delivered frame, not just provider headers or metadata.
// All EXIF/XMP/IPTC/comment segments are removed again as defense in depth.
export function sanitizeSocialPhoto(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SOCIAL_PHOTO_BYTES) throw invalid();
  let clean;
  try { clean = stripJpegMetadata(bytes); } catch { throw invalid(); }
  let offset = 2, dimensions;
  while (offset < clean.length) {
    if (clean[offset++] !== 0xff) throw invalid();
    while (clean[offset] === 0xff) offset++;
    const marker = clean[offset++];
    if (marker === 0xda) break;
    const length = (clean[offset] << 8) | clean[offset + 1];
    if (length < 2 || offset + length > clean.length) throw invalid();
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (dimensions || marker !== 0xc0 || length < 8 || clean[offset + 2] !== 8) throw invalid();
      dimensions = { height: (clean[offset + 3] << 8) | clean[offset + 4], width: (clean[offset + 5] << 8) | clean[offset + 6] };
      const components = clean[offset + 7];
      if (!dimensionsValid(dimensions) || ![1, 3].includes(components) || length !== 8 + 3 * components) throw invalid();
    }
    offset += length;
  }
  if (!dimensions) throw invalid();
  return { bytes: clean, ...dimensions };
}

/**
 * No original or provider URL crosses this service boundary. The caller must
 * authorize sharing and ownership before prepare/delivery, and recheck sharing
 * after delivery. Persist a preparation receipt under a durable lease: explicit
 * consumes a transformation even when the same derivative already exists.
 * Delivery never creates transformations. Eager derivatives remain authenticated
 * and are deleted with the original by the existing photo deletion service.
 */
export function createSocialPhotoService({ env = globalThis.process?.env ?? {}, sdk: suppliedSdk, fetchImpl = globalThis.fetch } = {}) {
  const sdk = suppliedSdk ?? (() => getCloudinarySdk(env));
  const enabled = () => { if (!suppliedSdk && env.PHOTO_CLOUD_PROVIDER !== "cloudinary") throw unavailable(); };
  return Object.freeze({
    async prepare(identity, photo) {
      const publicId = sourceIdentity(identity, photo);
      enabled();
      try {
        const cloudinary = await sdk();
        const original = await cloudinary.api.resource(publicId, { resource_type: "image", type: "authenticated", context: true });
        if (original?.public_id !== publicId || original.resource_type !== "image" || original.type !== "authenticated"
          || original.format !== "jpg" || original.bytes !== photo.size || original.context?.custom?.sha256 !== photo.cloud.sha256) throw unavailable();
        const resource = await cloudinary.uploader.explicit(publicId, {
          resource_type: "image", type: "authenticated", eager: [{ ...transformation, format: "jpg" }], eager_async: false, timeout: 30_000,
        });
        const derivative = resource?.eager?.[0];
        if (resource?.public_id !== publicId || resource.resource_type !== "image" || resource.type !== "authenticated"
          || !/^[0-9]{1,20}$/.test(String(resource.version ?? "")) || !dimensionsValid(derivative)
          || derivative.format !== "jpg" || !Number.isSafeInteger(derivative.bytes) || derivative.bytes < 1
          || derivative.bytes > MAX_SOCIAL_PHOTO_BYTES) throw unavailable();
        return { version: String(resource.version), sha256: photo.cloud.sha256,
          transformationVersion: SOCIAL_PHOTO_TRANSFORMATION_VERSION, width: derivative.width, height: derivative.height };
      } catch { throw unavailable(); }
    },
    async delivery(identity, photo, receipt) {
      const publicId = sourceIdentity(identity, photo);
      enabled();
      if (!receipt || receipt.sha256 !== photo.cloud.sha256 || receipt.transformationVersion !== SOCIAL_PHOTO_TRANSFORMATION_VERSION
        || !/^[0-9]{1,20}$/.test(receipt.version ?? "") || !dimensionsValid(receipt)) throw invalid();
      try {
        const cloudinary = await sdk();
        const url = new URL(cloudinary.url(publicId, { secure: true, resource_type: "image", type: "authenticated",
          sign_url: true, version: receipt.version, format: "jpg", transformation: [{ ...transformation }] }));
        const expectedSuffix = `/${transformationPath}/v${receipt.version}/${publicId}.jpg`;
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.hostname !== "res.cloudinary.com"
          || !/^\/[^/]+\/image\/authenticated\/s--[A-Za-z0-9_-]+--\//.test(url.pathname)
          || !url.pathname.endsWith(expectedSuffix)) throw unavailable();
        const response = await fetchImpl(url.href, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")
          || Number(response.headers.get("content-length") ?? 0) > MAX_SOCIAL_PHOTO_BYTES || !response.body?.getReader) throw unavailable();
        const reader = response.body.getReader(), chunks = []; let length = 0;
        try {
          while (true) {
            const { value, done } = await reader.read(); if (done) break;
            length += value.length;
            if (length > MAX_SOCIAL_PHOTO_BYTES) throw unavailable();
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        const result = sanitizeSocialPhoto(new Uint8Array(Buffer.concat(chunks, length)));
        if (result.width !== receipt.width || result.height !== receipt.height) throw unavailable();
        return result.bytes;
      } catch { throw unavailable(); }
    },
  });
}
