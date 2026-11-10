const MAX_PREFIXES = 1000;
const MAX_FIELD_PREFIXES = 128;
const allowed = /^[\p{L}\p{N} _-]+$/u;
const fail = () => { throw new TypeError("invalid_search"); };
const fold = value => value.normalize("NFKC").normalize("NFKD").replace(/\p{M}/gu, "")
  .toLocaleLowerCase("cs-CZ").replace(/\s+/gu, " ").trim();

export function normalizeDiscoveryQuery(value) {
  if (typeof value !== "string" || value.length > 160) return fail();
  const query = fold(value);
  if (query.length < 2 || query.length > 40 || !allowed.test(query)) return fail();
  return query;
}

// Each indexed field has its own budget, so long interests cannot starve region
// or name search. Indexes contain public opt-in text only, never private records.
function fieldPrefixes(value) {
  if (typeof value !== "string") return [];
  const normalized = fold(value.slice(0, 160)).replace(/[^\p{L}\p{N} _-]+/gu, " ").replace(/\s+/gu, " ").trim();
  const prefixes = new Set();
  const terms = [normalized, ...normalized.split(/[ _-]+/u).filter(Boolean).slice(0, 10)];
  for (const term of terms) {
    let prefix = "";
    for (const character of term) {
      prefix += character;
      if (prefix.length > 40 || prefixes.size >= MAX_FIELD_PREFIXES) break;
      if (prefix.length >= 2 && prefix.trim() === prefix) prefixes.add(prefix);
    }
    if (prefixes.size >= MAX_FIELD_PREFIXES) break;
  }
  return [...prefixes];
}

export function buildDiscoveryPrefixes(profile) {
  if (profile?.visibility !== "public" || profile.discoverable !== true) return [];
  const tokens = new Set();
  const add = (field, value) => {
    for (const prefix of fieldPrefixes(value)) {
      if (tokens.size >= MAX_PREFIXES) break;
      tokens.add(`${field}:${prefix}`);
    }
  };
  add("all", profile.handle);
  if (profile.directoryDiscoverable === true) {
    tokens.add("directory:new");
    add("all", profile.displayName);
    if (profile.sections?.interests === "public") {
      for (const value of [profile.specialization, profile.favoriteSpecies]) {
        add("all", value); add("interests", value);
      }
      if (profile.regionDiscoverable === true) {
        add("all", profile.region); add("region", profile.region);
      }
    }
  }
  return [...tokens];
}

export function validateDiscoveryRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))
    || Reflect.ownKeys(input).some(k => !["query", "field", "cursor", "mode"].includes(k))
    || Object.values(Object.getOwnPropertyDescriptors(input)).some(d => d.get || d.set)) return fail();
  const mode = input.mode ?? "search", field = input.field ?? "all", cursor = input.cursor ?? null;
  if (!["search", "new"].includes(mode) || !["all", "interests", "region"].includes(field)
    || cursor !== null && (typeof cursor !== "string" || cursor.length < 1 || cursor.length > 1024)) return fail();
  let query;
  if (mode === "new") {
    if (field !== "all" || input.query !== undefined && input.query !== "") return fail();
    query = "";
  } else query = normalizeDiscoveryQuery(input.query);
  return { query, field, cursor, mode, token: mode === "new" ? "directory:new" : `${field}:${query}` };
}
