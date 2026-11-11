import { createHash } from "node:crypto";
import { socialUid } from "./socialModel.js";
export const publicationId = (uid, catchId) => createHash("sha256").update(`${socialUid(uid)}/${socialUid(catchId)}`).digest("hex");
const fail = () => { throw new TypeError("invalid_publication"); };
export function publicationInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["catchId","photoId","visibility","fields","description","expectedRevision"].includes(k))) fail();
  socialUid(input.catchId); if (input.photoId != null) socialUid(input.photoId);
  const fields = input.fields ?? {};
  if (!["private","friends","public"].includes(input.visibility) || !fields || Array.isArray(fields) || typeof fields !== "object"
    || Object.keys(fields).some(k => !["length","weight","date","method","water"].includes(k))
    || ["length","weight","method","water"].some(k => fields[k] !== undefined && typeof fields[k] !== "boolean")
    || fields.date !== undefined && !["none","day","month"].includes(fields.date)
    || typeof input.description !== "string" || input.description.length > 1000 || Array.from(input.description).some(c => c.charCodeAt(0)<32 && c!=="\n" && c!=="\r" && c!=="\t")
    || input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) fail();
  return { catchId: input.catchId, photoId: input.photoId ?? null, visibility: input.visibility, description: input.description.trim(),
    fields: { length: fields.length === true, weight: fields.weight === true, method: fields.method === true, water: fields.water === true, date: fields.date ?? "none" },
    ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }) };
}
export function publicationContent(source, input, catalogueWater) {
  if (typeof source?.species !== "string" || !source.species.trim() || source.deleted) fail();
  const content = { species: source.species.slice(0,100), description: input.description };
  if (input.fields.length && Number.isFinite(source.lengthCm) && source.lengthCm > 0 && source.lengthCm <= 500) content.lengthCm = source.lengthCm;
  if (input.fields.weight && source.weightSource !== "estimated" && Number.isFinite(source.weightKg) && source.weightKg > 0 && source.weightKg <= 500) content.weightKg = source.weightKg;
  if (input.fields.date !== "none" && typeof source.caughtAt === "string" && Number.isFinite(Date.parse(source.caughtAt))) content.caughtAt = source.caughtAt.slice(0, input.fields.date === "month" ? 7 : 10);
  if (input.fields.method && typeof source.method?.label === "string") content.method = source.method.label.slice(0,100);
  if (input.fields.water && /^ris-[a-f0-9]{24}$/.test(catalogueWater?.id ?? "") && typeof catalogueWater.name === "string") {
    content.catalogueId = catalogueWater.id; content.waterName = catalogueWater.name.slice(0,160);
  }
  return content;
}
// Revocation is conservative: approved public values are never refreshed silently.
// Only changes to the approved projection invalidate publication; private notes/GPS do not.
export const contentFingerprint = content => createHash("sha256").update(JSON.stringify(content)).digest("hex");
