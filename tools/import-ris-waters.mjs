import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const hash = text => createHash("sha256").update(text).digest("hex");
export function compileRisExport(data) {
  if (!data?.complete || !Number.isSafeInteger(data.expectedCount) || data.expectedCount < 1 || data.expectedCount > 10000 || data.detailsFailed !== 0 || data.errors?.length || !Array.isArray(data.waters)) throw new Error("RIS export is incomplete.");
  const byUrl = new Map();
  for (const row of data.waters) {
    if (!/^https:\/\/www\.rybsvaz\.cz\/karta-reviru\/-\/[a-zA-Z0-9-]+$/.test(row.url) || !row.number?.trim() || !row.name?.trim() || !row.detail?.pageText?.trim() || !Number.isFinite(Date.parse(row.detail.retrievedAt))) throw new Error("Invalid RIS detail.");
    if (!Array.isArray(row.detail.headings) || row.detail.headings.some(heading=>typeof heading.text !== "string") || !Array.isArray(row.detail.tables) || row.detail.tables.some(table=>!Array.isArray(table.headers) || table.headers.some(cell=>typeof cell !== "string") || !Array.isArray(table.rows) || table.rows.some(cells=>!Array.isArray(cells) || cells.some(cell=>typeof cell !== "string")))) throw new Error("Invalid RIS detail tables/headings.");
    for (const key of ["areaHa","lengthKm"]) if(row.detail[key] != null && (!Number.isFinite(row.detail[key]) || row.detail[key] < 0)) throw new Error("Invalid source dimensions.");
    if (byUrl.has(row.url) && JSON.stringify(byUrl.get(row.url)) !== JSON.stringify(row)) throw new Error("Conflicting duplicate source URL.");
    byUrl.set(row.url, row);
  }
  if (byUrl.size !== data.expectedCount || data.detailsFetched !== data.expectedCount || data.listedCount != null && data.listedCount !== data.expectedCount) throw new Error("Export count does not match its distinct complete details.");
  const details = [...byUrl.values()].map(row => {
    const lines = row.detail.pageText.split("\n").map(line => line.trim());
    const typeAt = lines.findIndex(line => ["Mimopstruhový", "Pstruhový"].includes(line));
    const coordinates = row.detail.coordinates;
    if (coordinates && (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude) || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180)) throw new Error("Invalid source coordinates.");
    const end = lines.indexOf("Platnost povolenek", typeAt);
    return { ...row, id: `ris-${hash(row.url).slice(0,24)}`, fisheryType: typeAt >= 0 ? lines[typeAt] : null,
      union: typeAt >= 0 ? lines[typeAt + 1] || null : null,
      description: typeAt >= 0 && end > typeAt ? lines.slice(typeAt + 2, end).join("\n").trim() : null };
  }).sort((a,b) => a.id.localeCompare(b.id));
  if (new Set(details.map(row => row.id)).size !== details.length) throw new Error("Catalogue identifier collision.");
  const numbers = new Map();
  details.forEach(row => numbers.set(row.number.replace(/\s/g,""), (numbers.get(row.number.replace(/\s/g,"")) ?? 0) + 1));
  const index = details.map(({ detail, ...row }) => ({ ...row, coordinates: detail.coordinates, areaHa: detail.areaHa, lengthKm: detail.lengthKm, retrievedAt: detail.retrievedAt,
    numberUnique: numbers.get(row.number.replace(/\s/g,"")) === 1 }));
  const version = hash(JSON.stringify({ ...data, waters: details })).slice(0,16);
  const manifest = { schemaVersion: 1, version, count: details.length, sourceUrl: data.sourceUrl, sourceName: data.sourceName, fetchedAt: data.fetchedAt,
    sourceSha256: hash(JSON.stringify(data)), duplicateNumbers: [...numbers].filter(([,count]) => count > 1).map(([number,count]) => ({ number,count })),
    missing: Object.fromEntries(["coordinates","areaHa","lengthKm"].map(key => [key, details.filter(row => row.detail[key] == null).length])), notes: data.notes };
  return { manifest, index, details };
}

export async function importRisFile(source, root = resolve(dirname(fileURLToPath(import.meta.url)), "..")) {
  const compiled = compileRisExport(JSON.parse((await readFile(source,"utf8")).replace(/^\uFEFF/,"")));
  const folder = resolve(root, "public/data/ris", compiled.manifest.version);
  await mkdir(folder, { recursive: true });
  const write = (name, value) => writeFile(resolve(folder,name),JSON.stringify(value) + "\n","utf8");
  await write("index.json",compiled.index);
  const buckets = {};
  for (const row of compiled.details) (buckets[row.id.slice(4,5)] ??= {})[row.id] = row;
  for (const [bucket, records] of Object.entries(buckets)) await write(`details-${bucket}.json`,records);
  await writeFile(resolve(root,"src/features/waters/data/risManifest.json"),JSON.stringify(compiled.manifest,null,2) + "\n","utf8");
  return compiled.manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: node tools/import-ris-waters.mjs <complete-export.json>");
  console.log(JSON.stringify(await importRisFile(resolve(process.argv[2])),null,2));
}
