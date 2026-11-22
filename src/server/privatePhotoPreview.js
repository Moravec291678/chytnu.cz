import { Buffer } from "node:buffer";

const signatures = {
  "image/jpeg": bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": bytes => bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  "image/webp": bytes => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
};
let activePreviews = 0;

export function reservePrivatePhotoPreview() {
  if (activePreviews >= 4) return null;
  activePreviews++;
  return () => { activePreviews--; };
}

const FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

export async function renderPrivatePhotoPreview(bytes, sourceType, { edge, quality, maxBytes }) {
  if (!signatures[sourceType]?.(bytes)) throw new Error("Invalid photo signature.");
  const { default: sharp } = await import("sharp");
  const image = sharp(bytes, { limitInputPixels: 30_000_000, failOn: "error", unlimited: false });
  const { format } = await image.metadata();
  if (format !== FORMATS[sourceType]) throw new Error("Photo does not match its verified format.");
  const output = await image.autoOrient().resize({
    width: edge, height: edge, fit: "inside", withoutEnlargement: true,
  }).flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer();
  if (output.length < 1 || output.length > maxBytes) throw new Error("Photo preview exceeds its limit.");
  return output;
}

export function sendPrivatePhotoPreview(res, bytes) {
  res.setHeader?.("Cache-Control", "private, no-store");
  res.setHeader?.("Content-Type", "image/jpeg");
  res.setHeader?.("Content-Length", String(bytes.length));
  res.setHeader?.("Content-Disposition", "attachment; filename=photo.jpg");
  return res.status(200).send(bytes);
}
