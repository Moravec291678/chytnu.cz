import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { filterEligibleCatchRecords } from "../../catches/data/catchVerification.js";
import { SEASONAL_CHALLENGE, SEASONAL_CHALLENGE_RULES, SEASONAL_CHALLENGE_SEASONS } from "../../../product/config/challenges.js";
export { SEASONAL_CHALLENGE } from "../../../product/config/challenges.js";

const SPECIES_BY_KEY = new Map(DEFAULT_SPECIES.map((species) => [species.key, species]));

const SEASON_MATCHERS = Object.freeze({
  "cold-catch": (record) => {
    const temperature = record.conditions?.airTempC ?? record.conditions?.airTemperatureC ?? record.conditions?.temperatureC;
    return Number.isFinite(temperature) && temperature < SEASONAL_CHALLENGE_RULES.coldCatchMaxAirTempC;
  },
  "any-catch": () => true,
  "night-catch": (record) => {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp)) return false;
    const hour = new Date(timestamp).getHours();
    return hour >= SEASONAL_CHALLENGE_RULES.nightStartHour || hour < SEASONAL_CHALLENGE_RULES.nightEndHour;
  },
  "measured-carp": (record) => ["commonCarp", "carp"].includes(record.speciesKey) && isMeasuredCatchWeight(record),
  "measured-predator": (record) => {
    const species = SPECIES_BY_KEY.get(record.speciesKey);
    return Boolean(species?.isPredator && species.categoryKey !== "salmonids" && isMeasuredCatchWeight(record));
  },
  "measured-salmonid-or-other": (record) => {
    const species = SPECIES_BY_KEY.get(record.speciesKey);
    return Boolean(species && species.categoryKey !== "cyprinids"
      && (species.categoryKey === "salmonids" || !species.isPredator)
      && isMeasuredCatchWeight(record));
  },
});

const SEASONS = SEASONAL_CHALLENGE_SEASONS.map((season) => ({
  ...season,
  matches: season.ruleKey ? SEASON_MATCHERS[season.ruleKey] : null,
  challenges: season.challenges?.map((challenge) => ({ ...challenge, matches: SEASON_MATCHERS[challenge.ruleKey] })),
}));

function getSeasonKey(date) {
  const season = SEASONS.find((item) => item.months.includes(date.getMonth()));
  const seasonYear = date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `${seasonYear}-${season.key}`;
}

function getChallengesBySeason(catches) {
  const records = new Map();
  for (const record of catches) {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp)) continue;
    const key = getSeasonKey(new Date(timestamp));
    const bucket = records.get(key) ?? [];
    bucket.push(record);
    records.set(key, bucket);
  }
  return records;
}

function getSeasonChallenges(season) {
  if (season.challenges) return season.challenges;
  return [{ key: "primary", title: season.title, description: season.description, matches: season.matches }];
}

function buildVariant(catches, periodKey, definition) {
  const matches = catches.filter(definition.matches);
  const progress = Math.min(matches.length, SEASONAL_CHALLENGE.catchGoal);
  const bestCatch = matches.reduce((best, record) => (
    isMeasuredCatchWeight(record) && (!best || record.weightKg > best.weightKg)
      ? { id: record.id, weightKg: record.weightKg }
      : best
  ), null);
  return {
    id: definition.key === "carp" || definition.key === "primary"
      ? `season-${periodKey}`
      : `season-${periodKey}-${definition.key}`,
    key: definition.key,
    title: definition.title,
    shortLabel: definition.key === "other" ? "Ostatní" : definition.title,
    description: definition.description,
    progress,
    totalCatches: matches.length,
    goal: SEASONAL_CHALLENGE.catchGoal,
    xp: SEASONAL_CHALLENGE.xpReward,
    completed: matches.length >= SEASONAL_CHALLENGE.catchGoal,
    progressLabel: `${progress}/${SEASONAL_CHALLENGE.catchGoal}`,
    bestCatch,
  };
}

export function buildSeasonalChallenge(catches, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Datum sezónní výzvy musí být platné.");
  }
  const season = SEASONS.find((item) => item.months.includes(now.getMonth()));
  const periodKey = getSeasonKey(now);
  const seasonCatches = getChallengesBySeason(filterEligibleCatchRecords(catches, { now })).get(periodKey) ?? [];
  const variants = getSeasonChallenges(season).map((definition) => buildVariant(seasonCatches, periodKey, definition));
  const primary = variants[0];
  return {
    id: `season-${periodKey}`,
    title: season.title ?? primary.title,
    season: season.label,
    periodKey,
    description: season.description ?? primary.description,
    variants,
    // Keep the original single-challenge fields for existing consumers.
    progress: primary.progress,
    totalCatches: primary.totalCatches,
    goal: primary.goal,
    xp: primary.xp,
    completed: primary.completed,
    progressLabel: primary.progressLabel,
    bestCatch: primary.bestCatch,
  };
}

export function calculateSeasonalChallengeXp(catches, now = new Date()) {
  return listCompletedSeasonalChallengeRewards(catches, now).reduce((total, reward) => total + reward.xp, 0);
}

export function listCompletedSeasonalChallengeRewards(catches, now = new Date()) {
  catches = filterEligibleCatchRecords(catches, { now });
  const challenges = getChallengesBySeason(catches);
  return [...challenges].flatMap(([key, records]) => {
    const seasonKey = key.slice(key.indexOf("-") + 1);
    const season = SEASONS.find((item) => seasonKey === item.key);
    if (!season) return [];
    const orderedRecords = [...records].sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt));
    return getSeasonChallenges(season).flatMap((definition) => {
      const source = orderedRecords.find(definition.matches);
      if (!source) return [];
      return [{
        challengeId: definition.key === "carp" || definition.key === "primary"
          ? `season-${key}`
          : `season-${key}-${definition.key}`,
        periodKey: key,
        xp: SEASONAL_CHALLENGE.xpReward,
        sourceEntityType: "catch",
        sourceEntityId: source.id,
      }];
    });
  });
}
