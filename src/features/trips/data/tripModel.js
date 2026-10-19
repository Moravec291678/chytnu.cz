export function createTripRecord(data, now = new Date()) {
  const timestamp = now.toISOString();
  const title = data.title?.trim() || `Výprava · ${now.toLocaleDateString("cs-CZ")}`;
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title,
    locationName: data.locationName?.trim() ?? "",
    methodKey: data.methodKey || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    endedAt: null,
    sync: { status: "local", revision: 1 },
  };
}

export function endTripRecord(trip, now = new Date()) {
  if (trip.endedAt) throw new Error("Tato výprava už byla ukončena.");
  if (now.getTime() < Date.parse(trip.startedAt)) throw new Error("Konec výpravy nemůže být před začátkem.");
  return {
    ...trip,
    endedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sync: { ...(trip.sync ?? {}), status: "local", revision: (trip.sync?.revision ?? 0) + 1 },
  };
}

export function tripToForm(trip) {
  const localTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  };
  return {
    title: trip.title ?? "", locationName: trip.locationName ?? "", methodKey: trip.methodKey ?? "",
    startedAt: localTime(trip.startedAt), endedAt: localTime(trip.endedAt),
  };
}

export function updateTripRecord(trip, values, now = new Date()) {
  const title = values.title?.trim();
  if (!title || title.length > 80) throw new Error("Zadej název výpravy do 80 znaků.");
  const locationName = values.locationName?.trim() ?? "";
  if (locationName.length > 120) throw new Error("Lokalita může mít nejvýše 120 znaků.");
  const previousForm = tripToForm(trip);
  const timestamp = (value, original, previousValue, label) => {
    // Preserve the original instant, including milliseconds/DST offset, when
    // the user only edited text fields.
    if (value === previousValue) return original;
    if (!value || !Number.isFinite(Date.parse(value))) throw new Error(`Zadej platný ${label} výpravy.`);
    return new Date(value).toISOString();
  };
  const startedAt = timestamp(values.startedAt, trip.startedAt, previousForm.startedAt, "začátek");
  const endedAt = trip.endedAt ? timestamp(values.endedAt, trip.endedAt, previousForm.endedAt, "konec") : null;
  if (endedAt && Date.parse(endedAt) < Date.parse(startedAt)) throw new Error("Konec výpravy nemůže být před začátkem.");
  if (!endedAt && Date.parse(startedAt) > now.getTime()) throw new Error("Začátek aktivní výpravy nemůže být v budoucnosti.");
  return {
    ...trip, title, locationName, methodKey: values.methodKey || null, startedAt, endedAt,
    updatedAt: now.toISOString(),
    sync: { ...(trip.sync ?? {}), status: "local", revision: (trip.sync?.revision ?? 0) + 1 },
  };
}

export function getActiveTrip(trips) {
  return trips.find((trip) => !trip.endedAt) ?? null;
}

export function getTripDurationMs(trip, now = Date.now()) {
  const start = Date.parse(trip.startedAt);
  const end = trip.endedAt ? Date.parse(trip.endedAt) : now;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
}

export function formatTripDuration(durationMs) {
  if (durationMs === null) return "Doba neuvedena";
  const totalMinutes = Math.floor(durationMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function getTripCatchRatePerHour(catchCount, durationMs) {
  if (!Number.isSafeInteger(catchCount) || catchCount < 0 || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return catchCount * 3_600_000 / durationMs;
}

export function formatTripCatchCount(count) {
  const noun = count === 1 ? "úlovek" : count >= 2 && count <= 4 ? "úlovky" : "úlovků";
  return `${count} ${noun}`;
}

export function getDistinctTripSpecies(catches) {
  const speciesByKey = new Map();
  for (const record of catches) {
    if (typeof record.species !== "string" || !record.species.trim()) continue;
    const speciesKey = typeof record.speciesKey === "string" && record.speciesKey.trim()
      ? record.speciesKey.trim()
      : record.species.trim().toLocaleLowerCase("cs-CZ");
    if (!speciesByKey.has(speciesKey)) speciesByKey.set(speciesKey, record);
  }
  return [...speciesByKey.values()];
}
