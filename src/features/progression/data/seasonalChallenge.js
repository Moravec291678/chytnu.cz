import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";

export const SEASONAL_CHALLENGE = Object.freeze({
  catchGoal: 1,
  xpReward: 100,
});

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
  { key: "autumn", label: "Podzim", months: [8, 9, 10], title: "Kapřan sezóny", description: "Zaznamenej kapra s uvedenou hmotností.", matches: (record) => {
    const species = String(record.species ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("cs-CZ");
    return (record.speciesKey === "commonCarp" || species.includes("kapr"))
      && isMeasuredCatchWeight(record);
  } },
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

export function buildSeasonalChallenge(catches, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Datum sezónní výzvy musí být platné.");
  }
  const season = SEASONS.find((item) => item.months.includes(now.getMonth()));
  const matches = (getChallengesBySeason(catches).get(getSeasonKey(now)) ?? []).filter(season.matches);
  const progress = matches.length;
  const bestCatch = matches.reduce((best, record) => (
    isMeasuredCatchWeight(record) && (!best || record.weightKg > best.weightKg)
      ? { id: record.id, weightKg: record.weightKg }
      : best
  ), null);
  return {
    id: `season-${getSeasonKey(now)}`,
    title: season.title,
    season: season.label,
    progress: Math.min(progress, SEASONAL_CHALLENGE.catchGoal),
    totalCatches: matches.length,
    goal: SEASONAL_CHALLENGE.catchGoal,
    xp: SEASONAL_CHALLENGE.xpReward,
    completed: progress >= SEASONAL_CHALLENGE.catchGoal,
    description: season.description,
    progressLabel: `${Math.min(progress, SEASONAL_CHALLENGE.catchGoal)}/${SEASONAL_CHALLENGE.catchGoal}`,
    bestCatch,
  };
}

export function calculateSeasonalChallengeXp(catches) {
  return listCompletedSeasonalChallengeRewards(catches).length * SEASONAL_CHALLENGE.xpReward;
}

export function listCompletedSeasonalChallengeRewards(catches) {
  const challenges = getChallengesBySeason(catches);
  return [...challenges].flatMap(([key, records]) => {
    const seasonKey = key.slice(key.indexOf("-") + 1);
    const season = SEASONS.find((item) => seasonKey === item.key);
    const source = season && [...records]
      .sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt))
      .find(season.matches);
    return source ? [{
      challengeId: `season-${key}`, periodKey: key, xp: SEASONAL_CHALLENGE.xpReward,
      sourceEntityType: "catch", sourceEntityId: source.id,
    }] : [];
  });
}
