import { getCloudinarySdk, cloudinaryPublicId } from "../../../server/cloudinaryApi.js";
import { adminError } from "./adminValidation.js";
import { stripJpegMetadata } from "../../ai/server/productionSpeciesApi.js";

export class AdminPhotoResponse {
  constructor(bytes) { this.bytes = bytes; }
}
export function createAdminPhotoProxy({ env, fetchImpl = globalThis.fetch, sdk = () => getCloudinarySdk(env) } = {}) {
  return async ({ uid, catchId, photoId }, photo) => {
    const expectedKey = `users/${uid}/catches/${catchId}/photos/${photoId}/original`;
    if (photo.cloud?.provider !== "cloudinary" || photo.cloud.state !== "synced" || photo.cloud.objectKey !== expectedKey || !/^[a-f0-9]{64}$/.test(photo.cloud.sha256 ?? "")) throw adminError("photo_unavailable", 404);
    if (photo.type !== "image/jpeg") throw adminError("unsupported_support_photo", 422);
    const cloudinary = await sdk();
    // Reuse original private delivery; authenticated assets do not permit
    // arbitrary on-demand derivatives. Strip metadata using the existing parser.
    const url = cloudinary.utils.private_download_url(cloudinaryPublicId(uid, catchId, photoId), "jpg", { resource_type: "image", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 60 });
    if (!["res.cloudinary.com", "api.cloudinary.com"].includes(new URL(url).hostname)) throw adminError("photo_unavailable", 503);
    const response = await fetchImpl(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("image/jpeg") || Number(response.headers.get("content-length") ?? 0) > 2000000 || !response.body?.getReader) throw adminError("photo_unavailable", 503);
    const reader = response.body.getReader(), chunks = []; let length = 0;
    try { while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 2000000) throw adminError("photo_unavailable", 503); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return new AdminPhotoResponse(stripJpegMetadata(bytes)); }
    catch { throw adminError("unsupported_support_photo", 422); }
  };
}
