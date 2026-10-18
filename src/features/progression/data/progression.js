import { normalizeText } from "../../../shared/utils/helpers.js";

export const MAX_LEVEL = 20;

export const ACHIEVEMENTS = Object.freeze([
  { id: "first-catch", name: "První úlovek", description: "Zaznamenej první úlovek.", completed: ({ catches }) => catches.length >= 1 },
  { id: "first-kilo", name: "První kilo", description: "Zaznamenej úlovek o hmotnosti alespoň 1 kg.", completed: ({ catches }) => catches.some((item) => Number.isFinite(item.weightKg) && item.weightKg >= 1) },
  { id: "trophy-catch", name: "Trofejní úlovek", description: "Zaznamenej úlovek o hmotnosti alespoň 10 kg.", completed: ({ catches }) => catches.some((item) => Number.isFinite(item.weightKg) && item.weightKg >= 10) },
  { id: "ten-catches", name: "Prvních deset", description: "Zaznamenej deset úlovků.", completed: ({ catches }) => catches.length >= 10 },
  { id: "five-species", name: "Lovec druhů I", description: "Zaznamenej pět různých druhů.", completed: ({ speciesCount }) => speciesCount >= 5 },
  { id: "ten-species", name: "Lovec druhů II", description: "Zaznamenej deset různých druhů.", completed: ({ speciesCount }) => speciesCount >= 10 },
  { id: "night-catch", name: "Noční vlk", description: "Zaznamenej úlovek mezi 22:00 a 04:00.", completed: ({ catches }) => catches.some(isNightCatch) },
  { id: "marathon-trip", name: "Maratonec", description: "Dokonči výpravu trvající alespoň osm hodin.", completed: ({ trips }) => trips.some(isMarathonTrip) },
]);

export function xpForLevel(level) {
  const bounded = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  const step = bounded - 1;
  return 50 * step * step;
}

function uniqueKnown(catches, getter) {
  return new Set(catches.map(getter).filter(Boolean)).size;
}

function isNightCatch(record) {
  if (!record.caughtAt || Number.isNaN(Date.parse(record.caughtAt))) return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague",
  }).format(new Date(record.caughtAt)));
  return hour >= 22 || hour < 4;
}

function isMarathonTrip(trip) {
  if (!trip.startedAt || !trip.endedAt) return false;
  const duration = Date.parse(trip.endedAt) - Date.parse(trip.startedAt);
  return Number.isFinite(duration) && duration >= 8 * 60 * 60 * 1000;
}

export function calculateProgression(catches, trips = []) {
  const speciesCount = uniqueKnown(catches, (item) => item.speciesKey || normalizeText(item.species ?? "") || null);
  const locationCount = uniqueKnown(catches, (item) => normalizeText(item.locationName ?? "") || null);
  const completedTrips = trips.filter((trip) => trip.endedAt).length;
  const catchXp = catches.reduce((total, item) => {
    if (item.coordinates && item.conditions) return total + 20;
    if (item.photos?.length > 0) return total + 15;
    return total + 10;
  }, 0);
  const speciesXp = speciesCount * 50;
  const xp = catchXp + speciesXp;
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  const currentThreshold = xpForLevel(level);
  const nextThreshold = level === MAX_LEVEL ? null : xpForLevel(level + 1);
  const context = { catches, trips, speciesCount, locationCount, completedTrips };
  const achievements = ACHIEVEMENTS.map((item) => ({ ...item, isCompleted: item.completed(context) }));
  return {
    xp, level, currentThreshold, nextThreshold,
    progressPercent: nextThreshold === null ? 100 : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100),
    speciesCount, locationCount, completedTrips, achievements,
    completedAchievementCount: achievements.filter((item) => item.isCompleted).length,
    xpBreakdown: { catchXp, speciesXp },
  };
}
