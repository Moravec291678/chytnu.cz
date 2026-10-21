import { sha256Blob } from "./photoCloudProvider.js";

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", ...HEIC_TYPES]);

export function isHeicPhoto(file, fileName = "") {
  const type = String(file?.type ?? "").toLowerCase();
  const name = String(fileName || file?.name || "").toLowerCase();
  return HEIC_TYPES.has(type) || /\.(heic|heif)$/.test(name);
}

function defaultHeicConverter() {
  return import("heic2any").then((module) => module.default ?? module);
}

async function toSupportedSource(file, fileName, convertHeic) {
  if (isHeicPhoto(file, fileName)) {
    try {
      const converter = await convertHeic();
      const converted = await converter({ blob: file, toType: "image/png" });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      if (blob instanceof Blob && blob.type === "image/png" && blob.size > 0) return blob;
    } catch {
      // Fall through to native browser decoding below. Some newer HEIC variants
      // may not yet be recognized by the bundled converter.
    }
    return file;
  }
  let type = String(file?.type ?? "").toLowerCase();
  if (type === "image/jpg") {
    type = "image/jpeg";
    file = file.slice(0, file.size, type);
  }
  if (!IMAGE_TYPES.has(type)) {
    const extensionType = ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" })[String(fileName).toLowerCase().split(".").pop()];
    if (!extensionType) throw new Error("Vyber platnou fotografii. Podporujeme JPG, PNG, WebP, AVIF, HEIC a HEIF.");
    type = extensionType;
    file = file.slice(0, file.size, type);
  }
  return file;
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch { /* Try the browser's Image decoder. */ }
  }
  if (typeof Image === "undefined" || typeof URL?.createObjectURL !== "function") throw new Error("Toto zařízení neumí připravit fotografii pro synchronizaci.");
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    if (typeof image.decode === "function") await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    return { width: image.naturalWidth, height: image.naturalHeight, image, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function normalizePhotoForUpload(file, { fileName = file?.name ?? "", convertHeic = defaultHeicConverter, decode = decodeImage, canvasFactory = () => document.createElement("canvas") } = {}) {
  try {
    const source = await toSupportedSource(file, fileName, convertHeic);
    const bitmap = await decode(source);
    try {
      const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
      const canvas = canvasFactory();
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Fotografii se nepodařilo připravit.");
      context.drawImage(bitmap.image ?? bitmap, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Fotografii se nepodařilo připravit.")), "image/jpeg", 0.82));
      if (jpeg.type !== "image/jpeg" || jpeg.size < 1) throw new Error("Fotografii se nepodařilo převést na podporovaný JPEG.");
      return jpeg;
    } finally {
      bitmap.close?.();
    }
  } catch (error) {
    if (error?.message?.startsWith("Fotografii") || error?.message?.startsWith("HEIC") || error?.message?.startsWith("Vyber") || error?.message?.startsWith("Toto zařízení")) throw error;
    throw new Error(isHeicPhoto(file, fileName)
      ? "HEIC fotografii se nepodařilo převést. Zkus ji prosím uložit nebo sdílet jako JPEG."
      : "Fotografii se nepodařilo načíst. Zkus ji prosím uložit jako JPG, PNG nebo WebP.", { cause: error });
  }
}

/** Canonical local photo payload; its metadata always describes its final normalized bytes. */
export async function preparePhotoForStorageAndUpload(file, options = {}) {
  const blob = await normalizePhotoForUpload(file, options);
  return { blob, type: blob.type, size: blob.size, sha256: await sha256Blob(blob) };
}
