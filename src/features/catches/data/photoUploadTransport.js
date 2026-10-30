import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const NativePhotoUploadTransport = registerPlugin("PhotoUploadTransport");
const NATIVE_DIRECTORY = "chytnu-photo-uploads";

function encodeBase64(bytes) {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x6000) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 0x6000));
  }
  return globalThis.btoa(value);
}

function nativeError(event) {
  const code = event.errorCode === "rate_limited" || event.httpStatus === 429
    ? "cloudinary_rate_limited" : event.errorCode === "network_unavailable" ? "cloudinary_network_error" : "cloudinary_upload_failed";
  return Object.assign(new Error("Nativní upload fotografie nebyl dokončen."), {
    code, ...(Number.isInteger(event.httpStatus) ? { status: event.httpStatus } : {}),
  });
}

export function createPhotoUploadTransport({ platform = () => Capacitor.getPlatform(),
  webFetch = globalThis.fetch, native = NativePhotoUploadTransport, filesystem = Filesystem } = {}) {
  let nativeListener = null;
  async function ensureNativeListener() {
    if (platform() !== "ios" || nativeListener) return;
    nativeListener = await native.addListener("uploadState", (event) => {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("chytnu:native-photo-upload-changed", { detail: {
        operationId: event?.operationId, state: event?.state,
      } }));
    });
  }
  async function stageNativeFile({ operationId, contentType, bytes }) {
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[contentType];
    if (!extension || !(bytes instanceof Uint8Array) || !bytes.byteLength) throw new TypeError("Nativní foto upload vyžaduje připravené souborové bytes.");
    await filesystem.mkdir({ path: NATIVE_DIRECTORY, directory: Directory.Data, recursive: true }).catch(() => {});
    const fileName = `${NATIVE_DIRECTORY}/${operationId}.${extension}`;
    await filesystem.writeFile({ path: fileName, directory: Directory.Data, data: encodeBase64(bytes), recursive: true });
    return (await filesystem.getUri({ path: fileName, directory: Directory.Data })).uri;
  }

  async function enqueueUpload(input) {
    if (platform() !== "ios") {
      const form = new FormData();
      form.append("file", input.blob, input.fileName);
      for (const [key, value] of Object.entries(input.fields)) form.append(key, String(value));
      let response;
      try { response = await webFetch(input.uploadURL, { method: "POST", body: form }); }
      catch { throw Object.assign(new Error("Cloudinary image upload failed because of a network error."), { code: "cloudinary_network_error" }); }
      let body;
      try { body = await response.json(); } catch { body = {}; }
      return { state: response.ok ? "completed" : "failed_retryable", httpStatus: response.status, body };
    }

    const filePath = await stageNativeFile(input);
    await ensureNativeListener();
    let removeListener;
    let resolveCompletion;
    let rejectCompletion;
    const completed = new Promise((resolve, reject) => { resolveCompletion = resolve; rejectCompletion = reject; });
    void completed.catch(() => {}); // Completion may arrive before enqueue/status resolves.
    const listener = await native.addListener("uploadState", (event) => {
      if (event?.operationId !== input.operationId) return;
      if (event.state === "completed") resolveCompletion(event);
      else if (["failed_retryable", "interrupted", "cancelled"].includes(event.state)) rejectCompletion(nativeError(event));
    });
    const checkAfterResume = () => {
      void native.getUploadStatus({ operationId: input.operationId }).then((status) => {
        if (status.state === "completed") resolveCompletion(status);
        else if (["failed_retryable", "interrupted", "cancelled", "missing"].includes(status.state)) rejectCompletion(nativeError(status));
      }).catch(rejectCompletion);
    };
    globalThis.window?.addEventListener("pageshow", checkAfterResume);
    globalThis.window?.addEventListener("focus", checkAfterResume);
    globalThis.document?.addEventListener("visibilitychange", checkAfterResume);
    removeListener = () => {
      globalThis.window?.removeEventListener("pageshow", checkAfterResume);
      globalThis.window?.removeEventListener("focus", checkAfterResume);
      globalThis.document?.removeEventListener("visibilitychange", checkAfterResume);
      return listener.remove();
    };
    try {
      const queued = await native.enqueueUpload({ operationId: input.operationId, ownerId: input.ownerId,
        catchId: input.catchId, photoId: input.photoId, filePath, contentType: input.contentType,
        size: input.bytes.byteLength, sha256: input.sha256, uploadURL: input.uploadURL, fields: input.fields });
      if (queued.state === "completed") return { state: queued.state, httpStatus: queued.httpStatus, body: {} };
      const status = await native.getUploadStatus({ operationId: input.operationId });
      if (status.state === "completed") return { state: status.state, httpStatus: status.httpStatus, body: {} };
      if (["failed_retryable", "interrupted", "cancelled", "missing"].includes(status.state)) throw nativeError(status);
      const event = await completed;
      return { state: event.state, httpStatus: event.httpStatus, body: {} };
    } finally {
      await removeListener?.();
    }
  }

  async function cancelUpload({ operationId }) {
    if (platform() === "ios") await native.cancelUpload({ operationId });
  }

  async function cancelUploadsForOwner({ ownerId }) {
    if (platform() === "ios") await native.cancelUploadsForOwner({ ownerId });
  }

  async function cancelUploadsForPhoto({ ownerId, catchId, photoId }) {
    if (platform() !== "ios") return;
    const records = await listPendingUploads();
    await Promise.all(records.filter((record) => record.ownerId === ownerId && record.catchId === catchId
      && record.photoId === photoId).map((record) => native.cancelUpload({ operationId: record.operationId })));
  }

  async function getUploadStatus({ operationId }) {
    return platform() === "ios" ? native.getUploadStatus({ operationId }) : { operationId, state: "web" };
  }

  async function listPendingUploads() {
    if (platform() !== "ios") return [];
    return (await native.listPendingUploads()).uploads ?? [];
  }

  async function reconcileUploads() {
    if (platform() !== "ios") return [];
    await ensureNativeListener();
    return (await native.reconcileUploads()).uploads ?? [];
  }

  async function acknowledgeUpload({ operationId }) {
    if (platform() === "ios") await native.acknowledgeUpload({ operationId });
  }

  return Object.freeze({ enqueueUpload, cancelUpload, cancelUploadsForOwner, cancelUploadsForPhoto, getUploadStatus,
    listPendingUploads, reconcileUploads, acknowledgeUpload });
}

export const photoUploadTransport = createPhotoUploadTransport();
