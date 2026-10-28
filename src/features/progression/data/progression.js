import { normalizeText } from "../../../shared/utils/helpers.js";
import { calculateQuestXp } from "./challenges.js";
import { calculateSeasonalChallengeXp } from "./seasonalChallenge.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { calculateWeeklyStreak } from "./streakModel.js";
import { XP_RULES } from "./xpRules.js";
import { filterEligibleCatchRecords } from "../../catches/data/catchVerification.js";
export { calculateWeeklyStreak } from "./streakModel.js";

export const MAX_LEVEL = 100;

export const RANKS = Object.freeze([
  { minLevel: 1, maxLevel: 5, name: "Nováček", title: "Rybářský nadšenec" },
  { minLevel: 6, maxLevel: 15, name: "Rybář", title: "U vody" },
  { minLevel: 16, maxLevel: 29, name: "Zkušený rybář", title: "Znalec vod" },
  { minLevel: 30, maxLevel: 49, name: "Senior rybář", title: "Mistr prutu" },
  { minLevel: 50, maxLevel: 74, name: "Expert", title: "Vodní vlk" },
  { minLevel: 75, maxLevel: 99, name: "Legenda", title: "Kapitán vod" },
  { minLevel: 100, maxLevel: 100, name: "Prestige I+", title: "Rybářská legenda" },
]);

const ACHIEVEMENT_DEFINITIONS = [
  { id: "first-catch", name: "První úlovek", description: "Zaznamenej první úlovek.", category: "Úlovky", xp: 30, completed: ({ catches }) => catches.length >= 1 },
  { id: "first-kilo", name: "První kilo", description: "Zaznamenej úlovek o hmotnosti alespoň 1 kg.", category: "Úlovky", xp: 30, completed: ({ catches }) => catches.some((item) => isMeasuredCatchWeight(item) && item.weightKg >= 1) },
  { id: "trophy-catch", name: "Trofejní úlovek", description: "Zaznamenej úlovek o hmotnosti alespoň 10 kg.", category: "Úlovky", xp: 100, completed: ({ catches }) => catches.some((item) => isMeasuredCatchWeight(item) && item.weightKg >= 10) },
  { id: "ten-catches", name: "Prvních deset", description: "Zaznamenej deset úlovků.", category: "Úlovky", xp: 50, completed: ({ catches }) => catches.length >= 10 },
  { id: "fifty-catches", name: "Padesát úlovků", description: "Zaznamenej 50 úlovků.", category: "Úlovky", xp: 100, completed: ({ catches }) => catches.length >= 50 },
  { id: "five-hundred-catches", name: "Pět set úlovků", description: "Zaznamenej 500 úlovků.", category: "Úlovky", xp: 200, completed: ({ catches }) => catches.length >= 500 },
  { id: "five-species", name: "Lovec druhů I", description: "Zaznamenej pět různých druhů.", category: "Druhy", xp: 50, completed: ({ speciesCount }) => speciesCount >= 5 },
  { id: "ten-species", name: "Lovec druhů II", description: "Zaznamenej deset různých druhů.", category: "Druhy", xp: 75, completed: ({ speciesCount }) => speciesCount >= 10 },
  { id: "twenty-five-species", name: "Lovec druhů III", description: "Zaznamenej 25 různých druhů.", category: "Druhy", xp: 150, completed: ({ speciesCount }) => speciesCount >= 25 },
  { id: "fifty-species", name: "Rybí encyklopedie", description: "Zaznamenej 50 různých druhů.", category: "Druhy", xp: 200, completed: ({ speciesCount }) => speciesCount >= 50 },
  { id: "five-waters", name: "Objevitel vod I", description: "Zaznamenej úlovky z pěti různých revírů.", category: "Explorace", xp: 50, completed: ({ locationCount }) => locationCount >= 5 },
  { id: "ten-waters", name: "Objevitel vod II", description: "Zaznamenej úlovky z deseti různých revírů.", category: "Explorace", xp: 100, completed: ({ locationCount }) => locationCount >= 10 },
  { id: "twenty-five-waters", name: "Objevitel vod III", description: "Zaznamenej úlovky z 25 různých revírů.", category: "Explorace", xp: 200, completed: ({ locationCount }) => locationCount >= 25 },
  { id: "summer-catch", name: "Letní rybář", description: "Zaznamenej úlovek v létě.", category: "Sezóny", xp: 30, completed: ({ catches }) => catches.some((item) => caughtInMonths(item, [5, 6, 7])) },
  { id: "winter-catch", name: "Zimní rybář", description: "Zaznamenej úlovek v zimě.", category: "Sezóny", xp: 30, completed: ({ catches }) => catches.some((item) => caughtInMonths(item, [11, 0, 1])) },
  { id: "four-week-streak", name: "Čtyři týdny u vody", description: "Udrž týdenní sérii po dobu čtyř týdnů.", category: "Série", xp: 75, completed: ({ weeklyStreak }) => weeklyStreak >= 4 },
  { id: "twelve-week-streak", name: "Sezóna v rytmu", description: "Udrž týdenní sérii po dobu 12 týdnů.", category: "Série", xp: 150, completed: ({ weeklyStreak }) => weeklyStreak >= 12 },
  { id: "fifty-two-week-streak", name: "Rok aktivního rybaření", description: "Udrž týdenní sérii po dobu 52 týdnů.", category: "Série", xp: 200, completed: ({ weeklyStreak }) => weeklyStreak >= 52 },
  { id: "night-catch", name: "Noční vlk", description: "Zaznamenej úlovek mezi 22:00 a 04:00.", category: "Skryté", xp: 50, hidden: true, completed: ({ catches }) => catches.some(isNightCatch) },
  { id: "marathon-trip", name: "Maratonec", description: "Dokonči vycházku trvající alespoň osm hodin.", category: "Skryté", xp: 75, hidden: true, completed: ({ trips }) => trips.some(isMarathonTrip) },
];

const ACHIEVEMENT_TRACKS = Object.freeze({
  "first-catch": { goal: 1, current: ({ catches }) => catches.length },
  "first-kilo": { goal: 1, unit: "kg", current: ({ maxCatchWeight }) => maxCatchWeight },
  "trophy-catch": { goal: 10, unit: "kg", current: ({ maxCatchWeight }) => maxCatchWeight },
  "ten-catches": { goal: 10, current: ({ catches }) => catches.length },
  "fifty-catches": { goal: 50, current: ({ catches }) => catches.length },
  "five-hundred-catches": { goal: 500, current: ({ catches }) => catches.length },
  "five-species": { goal: 5, current: ({ speciesCount }) => speciesCount },
  "ten-species": { goal: 10, current: ({ speciesCount }) => speciesCount },
  "twenty-five-species": { goal: 25, current: ({ speciesCount }) => speciesCount },
  "fifty-species": { goal: 50, current: ({ speciesCount }) => speciesCount },
  "five-waters": { goal: 5, current: ({ locationCount }) => locationCount },
  "ten-waters": { goal: 10, current: ({ locationCount }) => locationCount },
  "twenty-five-waters": { goal: 25, current: ({ locationCount }) => locationCount },
  "summer-catch": { goal: 1, current: ({ catches }) => Number(catches.some((item) => caughtInMonths(item, [5, 6, 7]))) },
  "winter-catch": { goal: 1, current: ({ catches }) => Number(catches.some((item) => caughtInMonths(item, [11, 0, 1]))) },
  "four-week-streak": { goal: 4, current: ({ weeklyStreak }) => weeklyStreak },
  "twelve-week-streak": { goal: 12, current: ({ weeklyStreak }) => weeklyStreak },
  "fifty-two-week-streak": { goal: 52, current: ({ weeklyStreak }) => weeklyStreak },
});
export const ACHIEVEMENTS = Object.freeze(ACHIEVEMENT_DEFINITIONS.map((item) => Object.freeze({
  ...item,
  title: item.name,
  rule: item.description,
  target: ACHIEVEMENT_TRACKS[item.id]?.goal ?? 1,
  hidden: item.hidden === true,
})));
export const MASTERY_LEVELS = Object.freeze([
  { level: 1, catches: 1, xp: 50, title: "První úlovek" },
  { level: 2, catches: 5, xp: 30, title: "Znalec druhu" },
  { level: 3, catches: 20, xp: 50, title: "Zkušený lovec" },
  { level: 4, catches: 50, xp: 100, title: "Mistr druhu" },
  { level: 5, catches: 100, xp: 200, title: "Legenda druhu" },
]);

export function xpForLevel(level) {
  const bounded = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  const step = bounded - 1;
  return 50 * step * step;
}

function uniqueKnown(catches, getter) {
  return new Set(catches.map(getter).filter(Boolean)).size;
}

function caughtInMonths(record, months) {
  const timestamp = Date.parse(record.caughtAt);
  return Number.isFinite(timestamp) && months.includes(new Date(timestamp).getMonth());
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

export function hasWeatherConditions(conditions) {
  if (!conditions) return false;
  return [
    conditions.airTempC,
    conditions.airTemperatureC,
    conditions.waterTempC,
    conditions.waterTemperatureC,
    conditions.pressureHpa,
    conditions.windKmh,
    conditions.weather,
  ].some((value) => value !== null && value !== undefined && value !== "");
}

export function calculateSpeciesMastery(catches) {
  const recordsBySpecies = new Map();
  for (const record of catches) {
    const key = record.speciesKey || normalizeText(record.species ?? "") || null;
    if (!key) continue;
    recordsBySpecies.set(key, (recordsBySpecies.get(key) ?? 0) + 1);
  }
  return [...recordsBySpecies].map(([speciesKey, catchCount]) => {
    const milestones = MASTERY_LEVELS.filter((item) => catchCount >= item.catches);
    const current = milestones.at(-1) ?? MASTERY_LEVELS[0];
    const next = MASTERY_LEVELS.find((item) => item.catches > catchCount) ?? null;
    return {
      speciesKey,
      catchCount,
      level: current.level,
      stars: current.level,
      title: current.title,
      nextLevelAt: next?.catches ?? null,
      xp: milestones.reduce((total, item) => total + item.xp, 0),
    };
  });
}

export { calculateQuestXp };

export function getRankForLevel(level) {
  const bounded = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  return RANKS.find((rank) => bounded >= rank.minLevel && bounded <= rank.maxLevel);
}

export function calculateProgression(catches, trips = [], { now = new Date(), streakFreezes = [] } = {}) {
  catches = filterEligibleCatchRecords(catches);
  const speciesCount = uniqueKnown(catches, (item) => item.speciesKey || normalizeText(item.species ?? "") || null);
  const locationCount = uniqueKnown(catches, (item) => item.waterId || null);
  const completedTrips = trips.filter((trip) => trip.endedAt).length;
  const questXp = calculateQuestXp(catches, trips);
  const mastery = calculateSpeciesMastery(catches);
  const streak = calculateWeeklyStreak(catches, now, streakFreezes);
  const catchXp = catches.reduce((total, item) => {
    if (item.coordinates && hasWeatherConditions(item.conditions)) return total + XP_RULES.catch.gpsAndWeather;
    if (item.photos?.length > 0) return total + XP_RULES.catch.photo;
    return total + XP_RULES.catch.base;
  }, 0);
  const speciesXp = speciesCount * XP_RULES.newSpecies;
  const masteryXp = mastery.reduce((total, item) => total + item.xp - MASTERY_LEVELS[0].xp, 0);
  const streakXp = Math.floor(streak.weeks / 7) * XP_RULES.streakBonus;
  const locationXp = locationCount * XP_RULES.newWater;
  const seasonalXp = calculateSeasonalChallengeXp(catches);
  const maxCatchWeight = catches.reduce((maximum, item) => (
    isMeasuredCatchWeight(item) ? Math.max(maximum, item.weightKg) : maximum
  ), 0);
  const context = { catches, trips, speciesCount, locationCount, completedTrips, weeklyStreak: streak.weeks, maxCatchWeight };
  const achievements = ACHIEVEMENTS.map((item) => ({
    ...item,
    isCompleted: item.completed(context),
    ...(ACHIEVEMENT_TRACKS[item.id] ? {
      progress: Math.min(ACHIEVEMENT_TRACKS[item.id].current(context), ACHIEVEMENT_TRACKS[item.id].goal),
      goal: ACHIEVEMENT_TRACKS[item.id].goal,
      progressUnit: ACHIEVEMENT_TRACKS[item.id].unit ?? null,
    } : {}),
  }));
  const achievementXp = achievements.reduce((total, item) => total + (item.isCompleted ? item.xp : 0), 0);
  const xp = catchXp + speciesXp + masteryXp + streakXp + locationXp + questXp.total + seasonalXp + achievementXp;
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  const currentThreshold = xpForLevel(level);
  const nextThreshold = level === MAX_LEVEL ? null : xpForLevel(level + 1);
  return {
    xp,
    level,
    rank: getRankForLevel(level),
    currentThreshold,
    nextThreshold,
    progressPercent: nextThreshold === null ? 100 : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100),
    speciesCount,
    locationCount,
    completedTrips,
    streak,
    mastery,
    achievements,
    completedAchievementCount: achievements.filter((item) => item.isCompleted).length,
    xpBreakdown: {
      catchXp,
      speciesXp,
      locationXp,
      dailyQuestXp: questXp.dailyCatchXp + questXp.dailySpeciesXp + questXp.dailyTripXp,
      weeklyQuestXp: questXp.weeklySpeciesXp + questXp.weeklyWaterXp,
      seasonalXp,
      masteryXp,
      streakXp,
      achievementXp,
    },
  };
}
