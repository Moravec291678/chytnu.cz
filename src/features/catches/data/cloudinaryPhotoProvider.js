import { createPhotoObjectKey, sha256Blob } from "./photoCloudProvider.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = PRODUCT_LIMITS.photoBytes;
import { readPhotoBlob } from "./photoLocalBlob.js";
import { resolveApiUrl } from "../../../platform/api.js";

const CLOUDINARY_API_ORIGIN = "https://api.cloudinary.com";

function providerError(message, code) {
  return Object.assign(new Error(message), { code });
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function grantParams(grant) {
  if (!grant || typeof grant.cloudName !== "string" || !/^[a-z0-9-]{1,64}$/i.test(grant.cloudName)
    || typeof grant.apiKey !== "string" || !/^\d{5,32}$/.test(grant.apiKey)
    || grant.resourceType !== "image" || !Number.isInteger(grant.timestamp)
    || typeof grant.signature !== "string" || !/^[a-f0-9]{40,64}$/i.test(grant.signature)
    || !grant.params || typeof grant.params.public_id !== "string"
    || grant.params.type !== "authenticated" || grant.params.overwrite !== true) {
    throw providerError("Cloudinary authorization response is invalid.", "cloudinary_invalid_grant");
  }
  return grant;
}

export function createCloudinaryPhotoProvider({ fetchImpl = globalThis.fetch, apiUrl = resolveApiUrl } = {}) {
  async function available() {
    try {
      const response = await fetchImpl(apiUrl("/api/cloudinary/capability"), { method: "GET", credentials: "same-origin" });
      const body = await readJson(response);
      return response.ok && body.enabled === true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    id: "cloudinary",
    isAvailable: available,
    async upload(input) {
      if (!(input.blob instanceof Blob) || !ALLOWED_TYPES.has(input.contentType)
        || input.blob.size < 1 || input.blob.size > MAX_PHOTO_BYTES || input.blob.size !== input.size) {
        throw providerError("Fotografie nesplňuje limity pro bezpečný upload.", "invalid_photo");
      }
      // IndexedDB may restore a persisted File. Copy its bytes into a fresh in-memory
      // Blob before FormData/fetch; WebKit can otherwise upload an empty body.
      const uploadBlob = new Blob([await readPhotoBlob(input.blob, "photo-upload-memory-copy")], { type: input.contentType });
      if (uploadBlob.size !== input.size || await sha256Blob(uploadBlob) !== input.sha256) {
        throw providerError("Obsah fotografie neodpovídá ověřeným metadatům.", "photo_content_mismatch");
      }
      await input.onStage?.("signing");
      const expectedKey = createPhotoObjectKey(input.ownerId, input.catchId, input.photoId);
      if (input.objectKey !== expectedKey || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) {
        throw providerError("Photo cloud key does not match the authenticated photo.", "invalid_photo_identity");
      }
      const grant = grantParams(await input.requestUploadGrant({
        catchId: input.catchId, photoId: input.photoId, size: input.size,
        contentType: input.contentType, sha256: input.sha256,
      }));
      const expectedPublicId = `chytnucz/${expectedKey}`;
      if (grant.params.public_id !== expectedPublicId) {
        throw providerError("Cloudinary authorization targets a different asset.", "invalid_photo_identity");
      }
      const form = new FormData();
      form.append("file", uploadBlob, `${input.photoId}.${input.contentType === "image/jpeg" ? "jpg" : input.contentType.slice(6)}`);
      for (const [key, value] of Object.entries(grant.params)) form.append(key, String(value));
      form.append("api_key", grant.apiKey);
      form.append("timestamp", String(grant.timestamp));
      form.append("signature", grant.signature);
      let uploadResponse;
      let result;
      await input.onStage?.("uploading");
      input.onDiagnostic?.("cloud_upload_started", { bytes: uploadBlob.size, mimeType: uploadBlob.type });
      try {
        uploadResponse = await fetchImpl(`${CLOUDINARY_API_ORIGIN}/v1_1/${encodeURIComponent(grant.cloudName)}/image/upload`, {
          method: "POST", body: form,
        });
        result = await readJson(uploadResponse);
      } catch {
        input.onDiagnostic?.("cloud_upload_fail", { errorCode: "cloudinary_network_error" });
        throw providerError("Cloudinary image upload failed because of a network error.", "cloudinary_network_error");
      }
      if (!uploadResponse.ok) {
        const status = uploadResponse.status === 420 || uploadResponse.status === 429 ? "cloudinary_rate_limited" : "cloudinary_upload_failed";
        input.onDiagnostic?.("cloud_upload_fail", { errorCode: status, httpStatus: uploadResponse.status });
        throw Object.assign(providerError("Cloudinary did not accept the image upload.", status), { status: uploadResponse.status });
      }
      const expectedFormat = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[input.contentType];
      input.onDiagnostic?.("cloud_upload_response", { httpStatus: uploadResponse.status, bytes: result.bytes, format: result.format, resourceType: result.resource_type });
      if (result.public_id !== expectedPublicId || result.resource_type !== "image"
        || result.type !== "authenticated" || result.bytes !== input.size || result.format !== expectedFormat) {
        input.onDiagnostic?.("cloud_upload_fail", { errorCode: "cloudinary_response_mismatch" });
        throw providerError("Cloudinary returned metadata that does not match this photo.", "cloudinary_response_mismatch");
      }
      input.onDiagnostic?.("cloud_upload_pass", { bytes: result.bytes, format: result.format });
      await input.onStage?.("verifying");
      const verified = await input.requestUploadVerification({
        catchId: input.catchId, photoId: input.photoId, bytes: result.bytes, format: result.format,
        sha256: input.sha256,
      });
      if (verified?.verified !== true || verified.bytes !== input.size || verified.format !== expectedFormat) {
        throw providerError("Cloudinary asset could not be verified by the server.", "cloudinary_verification_failed");
      }
      return { objectKey: expectedKey };
    },
    async download(input) {
      const expectedKey = createPhotoObjectKey(input.ownerId, input.catchId, input.photoId);
      if (input.objectKey !== expectedKey) throw providerError("Photo cloud key is invalid.", "invalid_photo_identity");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const grant = await input.requestDownloadGrant({ catchId: input.catchId, photoId: input.photoId });
        let url;
        try { url = new URL(grant?.url); } catch { throw providerError("Cloudinary download authorization is invalid.", "cloudinary_invalid_grant"); }
        if (url.protocol !== "https:" || url.origin !== CLOUDINARY_API_ORIGIN
          || !url.pathname.includes("/image/download")) {
          throw providerError("Cloudinary download authorization is invalid.", "cloudinary_invalid_grant");
        }
        let response;
        try { response = await fetchImpl(url.href, { method: "GET", credentials: "omit" }); }
        catch { throw providerError("Cloudinary image download failed because of a network error.", "cloudinary_network_error"); }
        if (response.ok) return response.blob();
        if (response.status === 404) return null;
        if ((response.status === 401 || response.status === 403) && attempt === 0) continue;
        throw providerError("Cloudinary image download failed.", response.status === 429 ? "cloudinary_rate_limited"
          : response.status === 401 || response.status === 403 ? "cloudinary_download_expired" : "cloudinary_download_failed");
      }
      return null;
    },
    async delete(input) {
      const expectedKey = createPhotoObjectKey(input.ownerId, input.catchId, input.photoId);
      if (input.provider !== "cloudinary" || input.objectKey !== expectedKey) {
        throw providerError("Photo cloud key is invalid.", "invalid_photo_identity");
      }
      const result = await input.requestDeleteGrant({ catchId: input.catchId, photoId: input.photoId });
      if (result?.deleted !== true) throw providerError("Cloudinary could not delete the photo.", "cloudinary_delete_failed");
      return result;
    },
    async getMetadata(input) {
      if (!input?.ownerId || !input?.catchId || !input?.photoId
        || input.objectKey !== createPhotoObjectKey(input.ownerId, input.catchId, input.photoId)) return null;
      return input.requestMetadata?.({ catchId: input.catchId, photoId: input.photoId }) ?? null;
    },
    async recoverUpload(input) {
      if (input.objectKey !== createPhotoObjectKey(input.ownerId, input.catchId, input.photoId)
        || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) {
        throw providerError("Photo cloud key is invalid.", "invalid_photo_identity");
      }
      const format = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[input.contentType];
      if (!format || !Number.isInteger(input.size) || input.size < 1) return false;
      try {
        const result = await input.requestUploadVerification({
          catchId: input.catchId, photoId: input.photoId, bytes: input.size, format, sha256: input.sha256,
        });
        return result?.verified === true && result.bytes === input.size && result.format === format;
      } catch (error) {
        if ((error?.status === 404 && error?.code === "asset_not_found")
          || (error?.status === 409 && error?.code === "upload_response_mismatch")) return false;
        throw error;
      }
    },
  });
}

export const cloudinaryPhotoProvider = createCloudinaryPhotoProvider();
