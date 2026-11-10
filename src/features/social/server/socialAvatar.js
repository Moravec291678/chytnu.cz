import { Buffer } from "node:buffer";
import { getCloudinarySdk } from "../../../server/cloudinaryApi.js";
import { stripJpegMetadata } from "../../ai/server/productionSpeciesApi.js";
import { socialUid } from "../data/socialModel.js";

export const MAX_SOCIAL_AVATAR_BYTES = 200_000;
const unavailable = () => Object.assign(new Error("avatar_unavailable"), { code: "avatar_unavailable", status: 503 });
const invalid = () => Object.assign(new Error("invalid_avatar"), { code: "invalid_avatar", status: 400 });
const avatarId = (uid, assetId) => {
  socialUid(uid);
  if (typeof assetId !== "string" || !/^[a-f0-9]{32}$/.test(assetId)) throw invalid();
  return `chytnucz/users/${uid}/profile/avatar_${assetId}`;
};

// Read dimensions without decoding attacker-controlled pixels. The existing
// metadata parser rejects unsupported multi-scan JPEGs; browser canvas uploads
// are baseline JPEG. No decoder, transformation or paid provider feature needed.
export function sanitizeSocialAvatar(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_SOCIAL_AVATAR_BYTES) throw invalid();
  let clean;
  try { clean = stripJpegMetadata(bytes); } catch { throw invalid(); }
  let offset = 2, dimensions = null;
  while (offset < clean.length) {
    if (clean[offset++] !== 0xff) throw invalid();
    while (clean[offset] === 0xff) offset++;
    const marker = clean[offset++];
    if (marker === 0xda) break;
    const length = (clean[offset] << 8) | clean[offset + 1];
    if (length < 2 || offset + length > clean.length) throw invalid();
    // Reject arithmetic/lossless/differential encodings and multiple frames.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (dimensions || ![0xc0, 0xc2].includes(marker) || length < 8 || clean[offset + 2] !== 8) throw invalid();
      const height = (clean[offset + 3] << 8) | clean[offset + 4];
      const width = (clean[offset + 5] << 8) | clean[offset + 6];
      const components = clean[offset + 7];
      if (!height || !width || height > 512 || width > 512 || ![1, 3].includes(components) || length !== 8 + 3 * components) throw invalid();
      dimensions = { width, height };
    }
    offset += length;
  }
  if (!dimensions) throw invalid();
  return clean;
}

function decodeAvatar(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_SOCIAL_AVATAR_BYTES / 3) * 4
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw invalid();
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw invalid();
  return sanitizeSocialAvatar(bytes);
}

export function createSocialAvatarService({ env = globalThis.process?.env ?? {}, sdk: suppliedSdk, fetchImpl = globalThis.fetch } = {}) {
  const sdk = suppliedSdk ?? (() => getCloudinarySdk(env));
  const enabled = () => { if (!suppliedSdk && env.PHOTO_CLOUD_PROVIDER !== "cloudinary") throw unavailable(); };
  return Object.freeze({
    async save(uid, jpegBase64, assetId) {
      enabled();
      const publicId = avatarId(uid, assetId), bytes = decodeAvatar(jpegBase64);
      try {
        const cloudinary = await sdk();
        const resource = await cloudinary.uploader.upload(`data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`, {
          public_id: publicId, resource_type: "image", type: "authenticated", format: "jpg", overwrite: false, timeout: 30_000,
        });
        if (!/^[0-9]{1,20}$/.test(String(resource?.version ?? ""))) throw unavailable();
        return { version: String(resource.version) };
      } catch { throw unavailable(); }
    },
    async delivery(uid, assetId) {
      enabled();
      const publicId = avatarId(uid, assetId);
      try {
        const cloudinary = await sdk();
        const address = cloudinary.utils.private_download_url(publicId, "jpg", {
          resource_type: "image", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 60,
        });
        const url = new URL(address);
        if (url.protocol !== "https:" || url.username || url.password || url.port || !["res.cloudinary.com", "api.cloudinary.com"].includes(url.hostname)) throw unavailable();
        const response = await fetchImpl(url.href, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg")
          || Number(response.headers.get("content-length") ?? 0) > MAX_SOCIAL_AVATAR_BYTES || !response.body?.getReader) throw unavailable();
        const reader = response.body.getReader(), chunks = []; let length = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > MAX_SOCIAL_AVATAR_BYTES) throw unavailable();
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); }
        return sanitizeSocialAvatar(new Uint8Array(Buffer.concat(chunks, length)));
      } catch { throw unavailable(); }
    },
    async remove(uid, assetId) {
      const publicId = avatarId(uid, assetId);
      try {
        const cloudinary = await sdk();
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: "image", type: "authenticated", invalidate: true });
        if (!["ok", "not found"].includes(result?.result)) throw unavailable();
      } catch { throw unavailable(); }
    },
  });
}
