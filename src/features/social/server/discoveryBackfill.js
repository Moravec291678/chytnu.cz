import { validateStoredProfile } from "../data/publicProfileModel.js";
import { buildDiscoveryPrefixes } from "../data/discoveryModel.js";

// Operator-only bounded migration helper. The public API never accepts this
// cursor or runs this scan. Transactions preserve concurrent privacy edits.
export async function reindexDiscoveryPage({ db, cursor = null, pageSize = 25, now = () => Date.now() }) {
  if (!db || !Number.isSafeInteger(pageSize) || pageSize < 1
    || cursor !== null && (typeof cursor !== "string" || !cursor || cursor.length > 1500 || cursor.includes("/"))) throw new TypeError("invalid_reindex_request");
  const size = Math.max(25, Math.min(50, pageSize));
  let query = db.collection("publicProfiles").orderBy("__name__").limit(size);
  if (cursor !== null) query = query.startAfter(cursor);
  const page = await query.get();
  let updated = 0, invalid = 0;
  for (const entry of page.docs) {
    const outcome = await db.runTransaction(async tx => {
      const current = await tx.get(entry.ref);
      if (!current.exists) return { updated: false, invalid: false };
      const data = current.data();
      let prefixes = [], malformed = false;
      try {
        const profile = validateStoredProfile(data, now());
        if (profile.uid !== entry.id) throw new TypeError("invalid_profile_identity");
        prefixes = buildDiscoveryPrefixes(profile);
      } catch { malformed = true; }
      const changed = data.discoveryIndexVersion !== 1 || !Array.isArray(data.searchPrefixes)
        || data.searchPrefixes.length !== prefixes.length || data.searchPrefixes.some((value, index) => value !== prefixes[index]);
      if (changed) tx.update(entry.ref, { searchPrefixes: prefixes, discoveryIndexVersion: 1 });
      return { updated: changed, invalid: malformed };
    });
    updated += Number(outcome.updated); invalid += Number(outcome.invalid);
  }
  return { scanned: page.size, updated, invalid, nextCursor: page.size === size ? page.docs.at(-1).id : null };
}
