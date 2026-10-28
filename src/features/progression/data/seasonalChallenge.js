import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { filterEligibleCatchRecords } from "../../catches/data/catchVerification.js";

export const SEASONAL_CHALLENGE = Object.freeze({
  catchGoal: 1,
  xpReward: 100,
});

const SPECIES_BY_KEY = new Map(DEFAULT_SPECIES.map((species) => [species.key, species]));

const SEASONS = [
  { key: "winter", label: "Zima", months: [11, 0, 1], title: "Zimní warrior", description: "Zaznamenej úlovek při teplotě pod 5 °C.", matches: (record) => {
    const temperature = record.conditions?.airTempC ?? record.conditions?.airTemperatureC ?? record.conditions?.temperatureC;
    return Number.isFinite(temperature) && temperature < 5;
  } },
  { key: "spring", label: "Jaro", months: [2, 3, 4], title: "První úlovek po zimě", description: "Zaznamenej první jarní úlovek.", matches: () => true },
  { key: "summer", label: "Léto", months: [5, 6, 7], title: "Noční rybaření", description: "Zaznamenej letní úlovek mezi 22:00 a 04:00.", matches: (record) => {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp)) return false;
    const hour = new Date(timestamp).getHours();
    return hour >= 22 || hour < 4;
  } },
  { key: "autumn", label: "Podzim", months: [8, 9, 10], title: "Výzvy sezóny", description: "Vyber si cestu podle svého stylu rybolovu.", challenges: [
    {
      key: "carp",
      title: "Kapr",
      description: "Zaznamenej kapra s uvedenou hmotností.",
      matches: (record) => ["commonCarp", "carp"].includes(record.speciesKey) && isMeasuredCatchWeight(record),
    },
    {
      key: "predator",
      title: "Dravec",
      description: "Zaznamenej dravce s uvedenou hmotností.",
      matches: (record) => {
        const species = SPECIES_BY_KEY.get(record.speciesKey);
        return Boolean(species?.isPredator && species.categoryKey !== "salmonids" && isMeasuredCatchWeight(record));
      },
    },
    {
      key: "other",
      title: "Lososovité / ostatní",
      description: "Zaznamenej lososovitou nebo jinou nedravou rybu s uvedenou hmotností.",
      matches: (record) => {
        const species = SPECIES_BY_KEY.get(record.speciesKey);
        return Boolean(species && species.categoryKey !== "cyprinids"
          && (species.categoryKey === "salmonids" || !species.isPredator)
          && isMeasuredCatchWeight(record));
      },
    },
  ] },
];

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
  const seasonCatches = getChallengesBySeason(filterEligibleCatchRecords(catches)).get(periodKey) ?? [];
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

export function calculateSeasonalChallengeXp(catches) {
  return listCompletedSeasonalChallengeRewards(catches).reduce((total, reward) => total + reward.xp, 0);
}

export function listCompletedSeasonalChallengeRewards(catches) {
  catches = filterEligibleCatchRecords(catches);
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
