import { PRODUCT_LIMITS } from "./limits.js";

export const CHALLENGE_TIME_ZONE = "Europe/Prague";
export const WATER_VISIT_GAP_DAYS = PRODUCT_LIMITS.waterVisitGapDays;

export const DAILY_CHALLENGES = Object.freeze([
  { id: "daily-catch", ruleKey: "catch-count", title: "Zaznamenej dnešní úlovek", goal: 1, xpKey: "dailyChallenge" },
  { id: "daily-species", ruleKey: "species-count", title: "Zaznamenej dnes dva různé druhy", goal: 2, xpKey: "dailyChallenge" },
  { id: "daily-trip", ruleKey: "trip-count", title: "Dokonči dnešní vycházku", goal: 1, xpKey: "dailyChallenge" },
]);

export const WEEKLY_CHALLENGES = Object.freeze([
  { id: "weekly-species", ruleKey: "species-count", title: "Zaznamenej tři druhy tento týden", goal: 3, xpKey: "weeklyChallenge" },
  { id: "weekly-water", ruleKey: "water-visit", title: "Navštiv revír po 30 a více dnech", goal: 1, xpKey: "weeklyChallenge" },
]);

export const SEASONAL_CHALLENGE = Object.freeze({ catchGoal: 1, xpReward: 100 });
export const SEASONAL_CHALLENGE_RULES = Object.freeze({ coldCatchMaxAirTempC: 5, nightStartHour: 22, nightEndHour: 4 });

export const SEASONAL_CHALLENGE_SEASONS = Object.freeze([
  { key: "winter", label: "Zima", months: [11, 0, 1], title: "Zimní warrior", description: "Zaznamenej úlovek při teplotě pod 5 °C.", ruleKey: "cold-catch" },
  { key: "spring", label: "Jaro", months: [2, 3, 4], title: "První úlovek po zimě", description: "Zaznamenej první jarní úlovek.", ruleKey: "any-catch" },
  { key: "summer", label: "Léto", months: [5, 6, 7], title: "Noční rybaření", description: "Zaznamenej letní úlovek mezi 22:00 a 04:00.", ruleKey: "night-catch" },
  { key: "autumn", label: "Podzim", months: [8, 9, 10], title: "Výzvy sezóny", description: "Vyber si cestu podle svého stylu rybolovu.", challenges: [
    { key: "carp", title: "Kapr", description: "Zaznamenej kapra s uvedenou hmotností.", ruleKey: "measured-carp" },
    { key: "predator", title: "Dravec", description: "Zaznamenej dravce s uvedenou hmotností.", ruleKey: "measured-predator" },
    { key: "other", title: "Lososovité / ostatní", description: "Zaznamenej lososovitou nebo jinou nedravou rybu s uvedenou hmotností.", ruleKey: "measured-salmonid-or-other" },
  ] },
].map((season) => Object.freeze({
  ...season,
  months: Object.freeze([...season.months]),
  ...(season.challenges ? { challenges: Object.freeze(season.challenges.map((item) => Object.freeze(item))) } : {}),
})));
