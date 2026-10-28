import { ACHIEVEMENT_DEFINITIONS } from "./achievements.js";
import {
  DAILY_CHALLENGES,
  SEASONAL_CHALLENGE,
  SEASONAL_CHALLENGE_RULES,
  SEASONAL_CHALLENGE_SEASONS,
  WEEKLY_CHALLENGES,
} from "./challenges.js";
import { FEATURES } from "./featureFlags.js";
import { LEVEL_XP_BASE, MAX_LEVEL, MASTERY_LEVELS, RANKS } from "./levels.js";
import { NOTIFICATION_COPY, NOTIFICATION_PREFERENCES, NOTIFICATION_TYPE_PRESENTATION, NOTIFICATION_TYPES } from "./notifications.js";
import { PRODUCT_LIMITS } from "./limits.js";
import { SUPPORTER_CAPABILITIES } from "./supporter.js";
import { XP_RULES } from "./xp.js";

const ACHIEVEMENT_RULES = new Set([
  "catch-count", "weight-at-least", "species-count", "water-count", "month-catch", "streak", "night-catch", "trip-duration",
]);
const DAILY_WEEKLY_RULES = new Set(["catch-count", "species-count", "trip-count", "water-visit"]);
const SEASON_RULES = new Set(["cold-catch", "any-catch", "night-catch", "measured-carp", "measured-predator", "measured-salmonid-or-other"]);
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const DEEP_LINK_PATTERN = /^\/(?!\/)[A-Za-z0-9/_?=&%#.-]*$/;

export const PRODUCT_CONFIG = Object.freeze({
  achievements: ACHIEVEMENT_DEFINITIONS,
  dailyChallenges: DAILY_CHALLENGES,
  weeklyChallenges: WEEKLY_CHALLENGES,
  seasons: SEASONAL_CHALLENGE_SEASONS,
  seasonalChallenge: SEASONAL_CHALLENGE,
  seasonalRules: SEASONAL_CHALLENGE_RULES,
  features: FEATURES,
  levelXpBase: LEVEL_XP_BASE,
  maxLevel: MAX_LEVEL,
  masteries: MASTERY_LEVELS,
  ranks: RANKS,
  notificationTypes: NOTIFICATION_TYPES,
  notificationPreferences: NOTIFICATION_PREFERENCES,
  notificationPresentation: NOTIFICATION_TYPE_PRESENTATION,
  notificationCopy: NOTIFICATION_COPY,
  limits: PRODUCT_LIMITS,
  supporterCapabilities: SUPPORTER_CAPABILITIES,
  xp: XP_RULES,
});

function validXp(value) {
  return Number.isFinite(value) && value >= 0;
}

function addDuplicateErrors(items, label, errors, getId = (item) => item.id) {
  const seen = new Set();
  for (const item of items) {
    const id = getId(item);
    if (seen.has(id)) errors.push(`Duplicate ${label} ID: ${id}`);
    seen.add(id);
  }
}

function validMonthList(months) {
  return Array.isArray(months) && months.length > 0
    && months.every((month) => Number.isInteger(month) && month >= 0 && month <= 11)
    && new Set(months).size === months.length;
}

export function validateProductConfig({ routeExists = null, config = PRODUCT_CONFIG } = {}) {
  const errors = [];
  const {
    achievements, dailyChallenges, weeklyChallenges, seasons, seasonalChallenge, seasonalRules,
    features, levelXpBase, maxLevel, masteries, ranks, notificationTypes, notificationPreferences,
    notificationPresentation, notificationCopy, limits, supporterCapabilities, xp,
  } = config;
  const dailyAndWeekly = [...dailyChallenges, ...weeklyChallenges];
  const variants = seasons.flatMap((season) => season.challenges ?? []);

  addDuplicateErrors(achievements, "achievement", errors);
  addDuplicateErrors(dailyAndWeekly, "challenge", errors);
  addDuplicateErrors(seasons, "season", errors, (season) => season.key);
  addDuplicateErrors(variants, "seasonal challenge", errors, (challenge) => challenge.key);
  addDuplicateErrors(notificationTypes, "notification type", errors, (type) => type);
  addDuplicateErrors(notificationPreferences, "notification preference", errors, (preference) => preference.key);

  for (const item of achievements) {
    if (!ID_PATTERN.test(item.id ?? "")) errors.push(`Invalid achievement ID: ${item.id}`);
    if (!ACHIEVEMENT_RULES.has(item.ruleKey)) errors.push(`Unsupported achievement rule: ${item.ruleKey}`);
    if (!validXp(item.xp)) errors.push(`Invalid XP for achievement ${item.id}`);
    if (!Number.isFinite(item.goal ?? 1) || (item.goal ?? 1) <= 0) errors.push(`Invalid goal for achievement ${item.id}`);
    if (item.months && !validMonthList(item.months)) errors.push(`Invalid month list for achievement ${item.id}`);
  }

  for (const item of dailyAndWeekly) {
    if (!ID_PATTERN.test(item.id ?? "")) errors.push(`Invalid challenge ID: ${item.id}`);
    if (!DAILY_WEEKLY_RULES.has(item.ruleKey)) errors.push(`Unsupported challenge type: ${item.ruleKey}`);
    if (!Object.hasOwn(xp, item.xpKey) || !validXp(xp[item.xpKey])) errors.push(`Invalid XP rule for challenge ${item.id}`);
    if (!Number.isFinite(item.goal) || item.goal <= 0) errors.push(`Invalid goal for challenge ${item.id}`);
  }

  const coveredMonths = [];
  for (const season of seasons) {
    if (!ID_PATTERN.test(season.key ?? "")) errors.push(`Invalid season ID: ${season.key}`);
    if (!validMonthList(season.months)) errors.push(`Invalid month/date window for season ${season.key}`);
    else coveredMonths.push(...season.months);
    if (season.ruleKey && !SEASON_RULES.has(season.ruleKey)) errors.push(`Unsupported seasonal challenge type: ${season.ruleKey}`);
    for (const challenge of season.challenges ?? []) {
      if (!ID_PATTERN.test(challenge.key ?? "")) errors.push(`Invalid seasonal challenge ID: ${challenge.key}`);
      if (!SEASON_RULES.has(challenge.ruleKey)) errors.push(`Unsupported challenge type: ${challenge.ruleKey}`);
    }
  }
  if (coveredMonths.length !== 12 || new Set(coveredMonths).size !== 12) errors.push("Season date windows must cover each calendar month exactly once");
  if (!validXp(seasonalChallenge.xpReward) || !Number.isFinite(seasonalChallenge.catchGoal) || seasonalChallenge.catchGoal <= 0) {
    errors.push("Invalid seasonal challenge reward or goal");
  }
  if (![seasonalRules.coldCatchMaxAirTempC, seasonalRules.nightStartHour, seasonalRules.nightEndHour]
    .every(Number.isFinite)
    || seasonalRules.nightStartHour < 0 || seasonalRules.nightStartHour > 23
    || seasonalRules.nightEndHour < 0 || seasonalRules.nightEndHour > 23) {
    errors.push("Invalid seasonal challenge date/time rule");
  }

  for (const [key, value] of Object.entries(xp)) {
    if (key === "catchVerificationMultiplier") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`Invalid XP multipliers: ${key}`);
        continue;
      }
      for (const [level, multiplier] of Object.entries(value)) {
        if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) errors.push(`Invalid XP multiplier for ${level}`);
      }
    } else if (typeof value === "number" && !validXp(value)) errors.push(`Invalid XP value: ${key}`);
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, amount] of Object.entries(value)) if (!validXp(amount)) errors.push(`Invalid XP value: ${key}.${subKey}`);
    } else if (typeof value !== "number" || !validXp(value)) errors.push(`Invalid XP value: ${key}`);
  }

  if (!Number.isInteger(maxLevel) || maxLevel < 1 || !Number.isFinite(levelXpBase) || levelXpBase <= 0) {
    errors.push("Invalid level range or XP base");
  } else {
    let previous = -1;
    for (let level = 1; level <= maxLevel; level += 1) {
      const threshold = levelXpBase * (level - 1) ** 2;
      if (!Number.isFinite(threshold) || threshold <= previous) errors.push(`Non-monotonic XP threshold at level ${level}`);
      previous = threshold;
    }
  }
  let previousRankMax = 0;
  for (const rank of ranks) {
    if (!Number.isInteger(rank.minLevel) || !Number.isInteger(rank.maxLevel)
      || rank.minLevel !== previousRankMax + 1 || rank.maxLevel < rank.minLevel) {
      errors.push(`Non-monotonic rank threshold: ${rank.name}`);
    }
    previousRankMax = rank.maxLevel;
  }
  if (previousRankMax !== maxLevel) errors.push("Rank ranges must end at MAX_LEVEL");
  let previousMastery = 0;
  for (const mastery of masteries) {
    if (!Number.isInteger(mastery.catches) || mastery.catches <= previousMastery || !validXp(mastery.xp)) {
      errors.push(`Non-monotonic mastery threshold: ${mastery.level}`);
    }
    previousMastery = mastery.catches;
  }

  for (const [flag, enabled] of Object.entries(features)) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(flag) || typeof enabled !== "boolean") errors.push(`Invalid feature flag: ${flag}`);
  }

  for (const [id, capability] of Object.entries(supporterCapabilities)) {
    if (!/^[a-z][a-z0-9.-]*$/.test(id) || !capability.requiredEntitlement) errors.push(`Invalid Supporter capability: ${id}`);
    if (id === "catch.photos.extended" && (!Number.isInteger(capability.freeLimit) || !Number.isInteger(capability.supporterLimit)
      || capability.freeLimit !== limits.photosPerCatch || capability.supporterLimit < capability.freeLimit)) {
      errors.push(`Invalid photo entitlement limits: ${id}`);
    }
  }

  for (const type of notificationTypes) {
    if (!Object.hasOwn(notificationPresentation, type)) errors.push(`Missing notification presentation: ${type}`);
  }
  for (const [key, copy] of Object.entries(notificationCopy)) {
    if (!DEEP_LINK_PATTERN.test(copy.deepLink ?? "") || (routeExists && !routeExists(copy.deepLink))) {
      errors.push(`Broken notification deepLink at ${key}: ${copy.deepLink}`);
    }
  }

  for (const [key, value] of Object.entries(limits)) {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) errors.push(`Invalid product limit: ${key}`);
  }
  return errors;
}
