import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = "dist";
const allowedExtensions = new Set([".html", ".js", ".css", ".json", ".map", ".webmanifest"]);
const forbidden = [/CLOUDINARY_API_SECRET/i, /api_secret/i, /cloudinary:\/\//i];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (allowedExtensions.has(path.slice(path.lastIndexOf(".")).toLowerCase())) files.push(path);
  }
  return files;
}

const files = await walk(root);
const matches = [];
for (const path of files) {
  const text = await readFile(path, "utf8");
  if (forbidden.some((pattern) => pattern.test(text))) matches.push(path);
}
if (matches.length) {
  console.error(`Potential Cloudinary secret/config marker found in client build: ${matches.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Cloudinary client secret scan passed (${files.length} client assets checked).`);
}
