import { normalizeText } from "../../../shared/utils/helpers.js";
import { calculateQuestXp } from "./challenges.js";
import { calculateSeasonalChallengeXp } from "./seasonalChallenge.js";
import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { calculateWeeklyStreak } from "./streakModel.js";
import { XP_RULES } from "./xpRules.js";
import { filterEligibleCatchRecords } from "../../catches/data/catchVerification.js";
import { ACHIEVEMENT_DEFINITIONS } from "../../../product/config/achievements.js";
import { LEVEL_XP_BASE, MAX_LEVEL, MASTERY_LEVELS, RANKS } from "../../../product/config/levels.js";
import { PRODUCT_LIMITS } from "../../../product/config/limits.js";
export { calculateWeeklyStreak } from "./streakModel.js";
export { LEVEL_XP_BASE, MAX_LEVEL, MASTERY_LEVELS, RANKS } from "../../../product/config/levels.js";

const ACHIEVEMENT_RULES = Object.freeze({
  "catch-count": ({ catches }, item) => catches.length >= item.goal,
  "weight-at-least": ({ catches }, item) => catches.some((catchRecord) => isMeasuredCatchWeight(catchRecord) && catchRecord.weightKg >= item.threshold),
  "species-count": ({ speciesCount }, item) => speciesCount >= item.goal,
  "water-count": ({ locationCount }, item) => locationCount >= item.goal,
  "month-catch": ({ catches }, item) => catches.some((catchRecord) => caughtInMonths(catchRecord, item.months)),
  streak: ({ weeklyStreak }, item) => weeklyStreak >= item.goal,
  "night-catch": ({ catches }) => catches.some((record) => isNightCatch(record, PRODUCT_LIMITS.nightCatchStartHour, PRODUCT_LIMITS.nightCatchEndHour)),
  "trip-duration": ({ trips }, item) => trips.some((trip) => isMarathonTrip(trip, item.durationHours)),
});

const ACHIEVEMENT_PROGRESS = Object.freeze({
  "catch-count": ({ catches }) => catches.length,
  "weight-at-least": ({ maxCatchWeight }) => maxCatchWeight,
  "species-count": ({ speciesCount }) => speciesCount,
  "water-count": ({ locationCount }) => locationCount,
  "month-catch": ({ catches }, item) => Number(catches.some((catchRecord) => caughtInMonths(catchRecord, item.months))),
  streak: ({ weeklyStreak }) => weeklyStreak,
});

export const ACHIEVEMENTS = Object.freeze(ACHIEVEMENT_DEFINITIONS.map((item) => Object.freeze({
  ...item,
  title: item.name,
  rule: item.description,
  target: item.goal ?? 1,
  hidden: item.hidden === true,
  completed: (context) => ACHIEVEMENT_RULES[item.ruleKey](context, item),
})));

export function xpForLevel(level) {
  const bounded = Math.min(MAX_LEVEL, Math.max(1, Math.trunc(level)));
  const step = bounded - 1;
  return LEVEL_XP_BASE * step * step;
}

function uniqueKnown(catches, getter) {
  return new Set(catches.map(getter).filter(Boolean)).size;
}

function caughtInMonths(record, months) {
  const timestamp = Date.parse(record.caughtAt);
  return Number.isFinite(timestamp) && months.includes(new Date(timestamp).getMonth());
}

function isNightCatch(record, startHour = PRODUCT_LIMITS.nightCatchStartHour, endHour = PRODUCT_LIMITS.nightCatchEndHour) {
  if (!record.caughtAt || Number.isNaN(Date.parse(record.caughtAt))) return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague",
  }).format(new Date(record.caughtAt)));
  return hour >= startHour || hour < endHour;
}

function isMarathonTrip(trip, minimumDurationHours = PRODUCT_LIMITS.marathonTripHours) {
  if (!trip.startedAt || !trip.endedAt) return false;
  const duration = Date.parse(trip.endedAt) - Date.parse(trip.startedAt);
  return Number.isFinite(duration) && duration >= minimumDurationHours * 60 * 60 * 1000;
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
  catches = filterEligibleCatchRecords(catches, { now });
  const speciesCount = uniqueKnown(catches, (item) => item.speciesKey || normalizeText(item.species ?? "") || null);
  const locationCount = uniqueKnown(catches, (item) => item.waterId || null);
  const completedTrips = trips.filter((trip) => trip.endedAt).length;
  const questXp = calculateQuestXp(catches, trips, now);
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
  const seasonalXp = calculateSeasonalChallengeXp(catches, now);
  const maxCatchWeight = catches.reduce((maximum, item) => (
    isMeasuredCatchWeight(item) ? Math.max(maximum, item.weightKg) : maximum
  ), 0);
  const context = { catches, trips, speciesCount, locationCount, completedTrips, weeklyStreak: streak.weeks, maxCatchWeight };
  const achievements = ACHIEVEMENTS.map((item) => ({
    ...item,
    isCompleted: item.completed(context),
    ...(ACHIEVEMENT_PROGRESS[item.ruleKey] ? {
      progress: Math.min(ACHIEVEMENT_PROGRESS[item.ruleKey](context, item), item.goal),
      goal: item.goal,
      progressUnit: item.unit ?? null,
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
