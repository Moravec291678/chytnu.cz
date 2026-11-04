// Explicit operator-only smoke test. Uses fixed nonpersonal fixtures, never a journal.
// Run only after verifying Workers Free without billing; never print credentials.
import { createCloudflareSpeciesProvider, createCloudflareTextProvider, CLOUDFLARE_ZERO_COST_MODEL } from "../src/features/ai/server/cloudflareProvider.js";

const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "AI_CLOUDFLARE_MODEL"];
const missing = required.filter(name => !process.env[name]);
if (missing.length || process.env.AI_ZERO_COST_CONFIRMED !== "true") {
  console.error(JSON.stringify({ status: "BLOCKED", missing, reason: "Verify Workers Free without billing and set AI_ZERO_COST_CONFIRMED=true before a real request." }));
  process.exitCode = 1;
} else {
  try {
    const configuration = { accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN, model: process.env.AI_CLOUDFLARE_MODEL };
    const story = await createCloudflareTextProvider(configuration)({ notes: "Ráno jsem byl u vody. Žádnou rybu jsem nechytil. Potom jsem se vrátil domů.", action: "title" });
    // This generated 1px fixture contains no EXIF, person, fish or private location.
    const bytes = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgUbL4DwACCgFmeGgpMwAAAABJRU5ErkJggg==", "base64"));
    const species = await createCloudflareSpeciesProvider(configuration)({ bytes, mimeType: "image/png" });
    if (species.status !== "unknown" || !story.text) throw new Error("Model did not abstain on no-fish fixture.");
    console.log(JSON.stringify({ status: "PASS", model: CLOUDFLARE_ZERO_COST_MODEL, realProvider: true,
      textCharacters: story.text.length, noFishStatus: species.status, limitation: "Not Czech quality, real fish accuracy or iPhone acceptance; production source flags remain off." }));
  } catch {
    console.error(JSON.stringify({ status: "FAIL", reason: "Provider, quota, timeout or validated output check failed. No paid fallback or automatic retry." }));
    process.exitCode = 1;
  }
}
