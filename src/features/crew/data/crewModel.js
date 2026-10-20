export const CREW_PRIVACY_OPTIONS = Object.freeze([
  { id: "private", label: "Soukromá" },
  { id: "invite-only", label: "Pouze na pozvání" },
]);

export const CREW_CHALLENGE_TYPES = Object.freeze([
  { id: "catch-count", label: "Počet úlovků", unit: "úlovků" },
  { id: "species-count", label: "Počet druhů", unit: "druhů" },
  { id: "total-weight", label: "Celková váha", unit: "kg" },
]);

export const CREW_NAME_MAX_LENGTH = 60;
export const CREW_MIN_MEMBERS = 2;
export const CREW_MAX_MEMBERS = 10;

function normalizeName(value) {
  const name = String(value || "").trim();
  if (name.length < 2) throw new Error("Název Crew musí mít alespoň 2 znaky.");
  if (name.length > CREW_NAME_MAX_LENGTH) throw new Error(`Název Crew může mít maximálně ${CREW_NAME_MAX_LENGTH} znaků.`);
  return name;
}

function normalizePrivacy(value) {
  return CREW_PRIVACY_OPTIONS.some((item) => item.id === value) ? value : "private";
}

export function normalizeCrewChallenge(value = {}) {
  const enabled = value.enabled === true;
  const type = CREW_CHALLENGE_TYPES.some((item) => item.id === value.type) ? value.type : "catch-count";
  const numericTarget = Number(value.target);
  if (enabled && (!Number.isFinite(numericTarget) || numericTarget <= 0)) {
    throw new Error("Cíl Crew výzvy musí být kladné číslo.");
  }
  if (enabled && type !== "total-weight" && !Number.isInteger(numericTarget)) {
    throw new Error("Cíl počtu úlovků nebo druhů musí být celé číslo.");
  }
  const target = Number.isFinite(numericTarget) && numericTarget > 0 ? numericTarget : 10;
  if (target > 100000) throw new Error("Cíl Crew výzvy je příliš vysoký.");
  return { enabled, type, target };
}

export function createCrewRecord(input, scope, now = new Date()) {
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    scopeKey: scope.scopeKey,
    ownerId: scope.ownerId,
    name: normalizeName(input?.name),
    privacy: normalizePrivacy(input?.privacy),
    status: "local-draft",
    memberKeys: [scope.scopeKey],
    challenge: normalizeCrewChallenge(input?.challenge),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateCrewRecord(existing, input, now = new Date()) {
  return {
    ...existing,
    name: normalizeName(input?.name),
    privacy: normalizePrivacy(input?.privacy),
    challenge: normalizeCrewChallenge(input?.challenge),
    updatedAt: now.toISOString(),
  };
}
