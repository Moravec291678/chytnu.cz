const LIMIT = 5;
function storageKey(scopeKey) { return `chytnu:trophy-selection:v1:${scopeKey}`; }

export function readTrophySelection(scopeKey, storage = globalThis.localStorage) {
  if (!scopeKey) return null;
  try {
    const value = JSON.parse(storage?.getItem(storageKey(scopeKey)) || "null");
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === "string"))].slice(0, LIMIT) : null;
  } catch { return null; }
}

export function saveTrophySelection(scopeKey, ids, storage = globalThis.localStorage) {
  if (!scopeKey) throw new Error("Aktivní profil není připravený.");
  if (!Array.isArray(ids) || ids.length > LIMIT || ids.some((id) => typeof id !== "string" || !id)) {
    throw new Error(`Vyber nejvýše ${LIMIT} platných úlovků.`);
  }
  const selected = [...new Set(ids)];
  try { storage?.setItem(storageKey(scopeKey), JSON.stringify(selected)); }
  catch (error) { throw new Error("Výběr trofejí se nepodařilo uložit.", { cause: error }); }
  return selected;
}
