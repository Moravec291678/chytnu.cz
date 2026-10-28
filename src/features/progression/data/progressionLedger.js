import { openLocalDatabase, PROGRESSION_EVENT_STORE_NAME } from "../../catches/data/catchRepository.js";
import { validateDataScope } from "../../auth/data/localDataScope.js";
import { normalizeText } from "../../../shared/utils/helpers.js";
import {
  ACHIEVEMENTS, MASTERY_LEVELS, calculateProgression, calculateSpeciesMastery,
  getRankForLevel, hasWeatherConditions, MAX_LEVEL, xpForLevel,
} from "./progression.js";
import { listCompletedChallengeRewards } from "./challenges.js";
import { listCompletedSeasonalChallengeRewards } from "./seasonalChallenge.js";
import { canUseStreakFreeze, calculateWeeklyStreak, getPragueStreakMonthKey, getPragueStreakWeekKey } from "./streakModel.js";
import { XP_RULES } from "./xpRules.js";
import { getCatchRarity } from "../../catches/utils/rarity.js";
import { DEFAULT_SPECIES } from "../../../shared/constants/speciesCatalog.js";
import { filterEligibleCatchRecords, getCatchPhotoHash, isCatchProgressionEligible, isValidPhotoHash } from "../../catches/data/catchVerification.js";

const DEFINITION_VERSION = 2;
const claimedRewardEventIds = new Set();
function hasContext(record) {
  return Boolean(record?.coordinates && hasWeatherConditions(record.conditions));
}

function eventId(scopeKey, reasonKey) { return `${scopeKey}|${reasonKey}`; }

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction, db) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("Rybářský postup se nepodařilo uložit.")); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error("Uložení postupu bylo přerušeno.")); };
  });
}

function validDate(value, fallback) { return Number.isFinite(Date.parse(value)) ? value : fallback; }

function makeEvent(scope, definition, now) {
  return {
    id: eventId(scope.scopeKey, definition.reasonKey), scopeKey: scope.scopeKey, ownerId: scope.ownerId,
    type: definition.type, reasonKey: definition.reasonKey, xp: definition.xp,
    sourceEntityType: definition.sourceEntityType, sourceEntityId: definition.sourceEntityId,
    definitionVersion: DEFINITION_VERSION, periodKey: definition.periodKey ?? null,
    occurredAt: validDate(definition.occurredAt, now), createdAt: now,
    sync: { status: "local", revision: 1 },
  };
}

export function summaryForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  const currentThreshold = xpForLevel(level);
  const nextThreshold = level === MAX_LEVEL ? null : xpForLevel(level + 1);
  return {
    xp, level, rank: getRankForLevel(level), currentThreshold, nextThreshold,
    progressPercent: nextThreshold === null ? 100 : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100),
  };
}

const BREAKDOWN_KEYS = Object.freeze({
  "catch.created": "catchXp", "catch.photo": "catchXp", "catch.context": "catchXp",
  "species.first": "speciesXp", "water.first": "locationXp", "water.created": "locationXp",
  "achievement.unlocked": "achievementXp", "mastery.milestone": "masteryXp",
  "streak.milestone": "streakXp", "streak.bonus": "streakXp",
  "share.public": "publicShareXp", "rarity.legendary": "rarityXp",
});

function breakdownKey(event) {
  if (event.type === "challenge.completed") {
    if (event.reasonKey.includes(":daily-")) return "dailyQuestXp";
    if (event.reasonKey.includes(":weekly-")) return "weeklyQuestXp";
    return "seasonalXp";
  }
  return BREAKDOWN_KEYS[event.type] ?? "otherXp";
}

export function buildLedgerProgressionSummary(events, catches = [], trips = [], { now = new Date() } = {}) {
  const streakFreezes = events.filter((event) => event.type === "streak.freeze.used");
  const current = calculateProgression(catches, trips, { now, streakFreezes });
  const xp = events.reduce((total, event) => total + Math.max(0, Number(event.xp) || 0), 0);
  const persistentAchievementIds = new Set(events.filter((event) => event.type === "achievement.unlocked")
    .map((event) => event.reasonKey.slice("achievement.unlocked:".length)));
  const achievements = current.achievements.map((achievement) => ({
    ...achievement, isCompleted: persistentAchievementIds.has(achievement.id),
  }));
  const masteryEvents = events.filter((event) => event.type === "mastery.milestone");
  const currentMastery = new Map(calculateSpeciesMastery(filterEligibleCatchRecords(catches)).map((item) => [item.speciesKey, item]));
  const masterySpecies = new Set([...currentMastery.keys(), ...masteryEvents.map((event) => event.reasonKey.split(":")[1])]);
  const mastery = [...masterySpecies].map((speciesKey) => {
    const item = currentMastery.get(speciesKey) ?? { speciesKey, catchCount: 0, nextLevelAt: 1, xp: 0 };
    const persistentLevel = masteryEvents.filter((event) => event.reasonKey.startsWith(`mastery.milestone:${speciesKey}:`))
      .reduce((maximum, event) => Math.max(maximum, Number(event.reasonKey.split(":").at(-1)) || 0), 0);
    const level = Math.max(item.level ?? 0, persistentLevel);
    const persistedProgress = MASTERY_LEVELS.find((milestone) => milestone.level === persistentLevel)?.catches ?? 0;
    const progressCount = Math.max(item.catchCount, persistedProgress);
    const nextMilestone = MASTERY_LEVELS.find((milestone) => milestone.level > level) ?? null;
    const persistentXp = events.filter((event) => (
      event.reasonKey === `species.first:${speciesKey}`
      || event.reasonKey.startsWith(`mastery.milestone:${speciesKey}:`)
    )).reduce((total, event) => total + Math.max(0, Number(event.xp) || 0), 0);
    return {
      ...item,
      level,
      stars: level,
      xp: persistentXp,
      progressCount,
      nextLevelAt: nextMilestone?.catches ?? null,
      title: MASTERY_LEVELS[level - 1]?.title ?? null,
    };
  });
  const xpBreakdown = {
    catchXp: 0, speciesXp: 0, locationXp: 0, dailyQuestXp: 0, weeklyQuestXp: 0,
    seasonalXp: 0, masteryXp: 0, streakXp: 0, achievementXp: 0, publicShareXp: 0, rarityXp: 0, otherXp: 0,
  };
  for (const event of events) xpBreakdown[breakdownKey(event)] += Math.max(0, Number(event.xp) || 0);
  return {
    ...current, ...summaryForXp(xp), events, achievements,
    completedAchievementCount: achievements.filter((item) => item.isCompleted).length,
    mastery, xpBreakdown,
  };
}

function eventOccurredAt(entityType, entityId, catches, trips, fallback) {
  if (entityType === "catch") return catches.find((item) => item.id === entityId)?.caughtAt ?? fallback;
  if (entityType === "trip") return trips.find((item) => item.id === entityId)?.endedAt ?? fallback;
  return fallback;
}

function speciesKeyFor(record) {
  return record?.speciesKey || normalizeText(record?.species ?? "") || null;
}

function firstUniqueRecord(records, keyForRecord, targetCount) {
  const seen = new Set();
  for (const record of records) {
    const key = keyForRecord(record);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (seen.size >= targetCount) return record;
  }
  return null;
}

function achievementSource(achievementId, catches, trips, nowIso) {
  const byWeight = (minimum) => catches.find((record) => (
    record.weightSource !== "estimated" && Number.isFinite(record.weightKg) && record.weightKg >= minimum
  ));
  const catchTargets = { "first-catch": 1, "ten-catches": 10, "fifty-catches": 50, "five-hundred-catches": 500 };
  const speciesTargets = { "five-species": 5, "ten-species": 10, "twenty-five-species": 25, "fifty-species": 50 };
  const waterTargets = { "five-waters": 5, "ten-waters": 10, "twenty-five-waters": 25 };
  let source = catchTargets[achievementId] ? catches[catchTargets[achievementId] - 1] : null;
  if (achievementId === "first-kilo") source = byWeight(1);
  if (achievementId === "trophy-catch") source = byWeight(10);
  if (speciesTargets[achievementId]) source = firstUniqueRecord(catches, speciesKeyFor, speciesTargets[achievementId]);
  if (waterTargets[achievementId]) source = firstUniqueRecord(catches, (record) => record.waterId || null, waterTargets[achievementId]);
  if (achievementId === "summer-catch") source = catches.find((record) => {
    const month = new Date(record.caughtAt).getMonth();
    return Number.isFinite(month) && [5, 6, 7].includes(month);
  });
  if (achievementId === "winter-catch") source = catches.find((record) => {
    const month = new Date(record.caughtAt).getMonth();
    return Number.isFinite(month) && [11, 0, 1].includes(month);
  });
  if (achievementId === "night-catch") source = catches.find((record) => {
    if (!Number.isFinite(Date.parse(record.caughtAt))) return false;
    const hour = Number(new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Prague",
    }).format(new Date(record.caughtAt)));
    return hour >= 22 || hour < 4;
  });
  if (achievementId === "marathon-trip") {
    const trip = [...trips].sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt)).find((item) => (
      Number.isFinite(Date.parse(item.startedAt)) && Number.isFinite(Date.parse(item.endedAt))
      && Date.parse(item.endedAt) - Date.parse(item.startedAt) >= 8 * 60 * 60 * 1000
    ));
    if (trip) return { entityType: "trip", entityId: trip.id, occurredAt: trip.endedAt };
  }
  if (!source && achievementId.endsWith("-week-streak")) source = catches.at(-1);
  return source
    ? { entityType: "catch", entityId: source.id, occurredAt: source.caughtAt }
    : { entityType: "system", entityId: achievementId, occurredAt: nowIso };
}

export const progressionLedger = {
  async list(options) {
    const scope = validateDataScope(options ?? {});
    const db = await openLocalDatabase();
    try {
      const transaction = db.transaction(PROGRESSION_EVENT_STORE_NAME, "readonly");
      const events = await requestValue(transaction.objectStore(PROGRESSION_EVENT_STORE_NAME).index("scopeKey").getAll(scope.scopeKey));
      return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } finally { db.close(); }
  },

  async awardWater(water, options) {
    const scope = validateDataScope(options ?? {});
    if (!water?.id) throw new Error("Revír nemá stabilní ID.");
    const reasonKey = `water.created:${water.id}`;
    const db = await openLocalDatabase();
    const transaction = db.transaction(PROGRESSION_EVENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME);
    const id = eventId(scope.scopeKey, reasonKey);
    const existing = await requestValue(store.get(id));
    if (existing) {
      await transactionDone(transaction, db);
      return { event: existing, isNew: false };
    }
    const event = makeEvent(scope, {
      reasonKey, type: "water.created", xp: XP_RULES.newWater,
      sourceEntityType: "water", sourceEntityId: water.id,
      occurredAt: water.createdAt,
    }, new Date().toISOString());
    store.add(event);
    await transactionDone(transaction, db);
    return { event, isNew: true };
  },

  async awardPublicShare(catchId, options) {
    const scope = validateDataScope(options ?? {});
    if (!catchId) throw new Error("Sdílený úlovek nemá stabilní ID.");
    const reasonKey = `share.public:${catchId}`;
    const db = await openLocalDatabase();
    const transaction = db.transaction([PROGRESSION_EVENT_STORE_NAME, "catches"], "readwrite");
    const store = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME);
    const id = eventId(scope.scopeKey, reasonKey);
    const [existing, catchRecord] = await Promise.all([
      requestValue(store.get(id)),
      requestValue(transaction.objectStore("catches").get(catchId)),
    ]);
    if (existing) {
      await transactionDone(transaction, db);
      return { event: existing, isNew: false, eligible: true };
    }
    if (!catchRecord || catchRecord.scopeKey !== scope.scopeKey) {
      transaction.abort();
      await new Promise((resolve) => { transaction.onabort = resolve; transaction.onerror = resolve; });
      db.close();
      throw new Error("Sdílený úlovek už není dostupný v tomto profilu.");
    }
    let verifiedPhotoClaim = null;
    if (catchRecord.verification?.status === "verified" && isValidPhotoHash(catchRecord.verification.photoHash)) {
      verifiedPhotoClaim = await requestValue(store.get(eventId(scope.scopeKey, `verification.photo.claimed:${catchRecord.verification.photoHash.toLowerCase()}`)));
    }
    const xpEligible = isCatchProgressionEligible(catchRecord)
      && (!catchRecord.verification || verifiedPhotoClaim?.sourceEntityId === catchId);
    if (!xpEligible) {
      await transactionDone(transaction, db);
      return { event: null, isNew: false, eligible: false };
    }
    const event = makeEvent(scope, {
      reasonKey, type: "share.public", xp: XP_RULES.publicShare,
      sourceEntityType: "catch", sourceEntityId: catchId, occurredAt: new Date().toISOString(),
    }, new Date().toISOString());
    store.add(event);
    await transactionDone(transaction, db);
    return { event, isNew: true, eligible: true };
  },

  async useStreakFreeze(options, { now = new Date() } = {}) {
    const scope = validateDataScope(options ?? {});
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(nowDate.getTime())) throw new TypeError("Datum zmrazení série musí být platné.");
    const monthKey = getPragueStreakMonthKey(nowDate);
    const weekKey = getPragueStreakWeekKey(nowDate);
    const reasonKey = `streak.freeze.used:${monthKey}`;
    const db = await openLocalDatabase();
    const transaction = db.transaction([PROGRESSION_EVENT_STORE_NAME, "catches"], "readwrite");
    const eventStore = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME);
    const id = eventId(scope.scopeKey, reasonKey);
    const [existing, events, catches] = await Promise.all([
      requestValue(eventStore.get(id)),
      requestValue(eventStore.index("scopeKey").getAll(scope.scopeKey)),
      requestValue(transaction.objectStore("catches").index("scopeKey").getAll(scope.scopeKey)),
    ]);
    if (existing) {
      await transactionDone(transaction, db);
      return { event: existing, isNew: false };
    }
    if (!canUseStreakFreeze(catches, events, nowDate)) {
      transaction.abort();
      await new Promise((resolve) => {
        transaction.onabort = resolve;
        transaction.onerror = resolve;
      });
      db.close();
      throw new Error("Zmrazení lze použít jen pro aktivní sérii bez úlovku v tomto týdnu; měsíční limit je vyčerpán nebo nelze sérii zachránit.");
    }
    const event = makeEvent(scope, {
      reasonKey, type: "streak.freeze.used", xp: 0,
      sourceEntityType: "system", sourceEntityId: `streak-freeze:${weekKey}`,
      periodKey: weekKey, occurredAt: nowDate.toISOString(),
    }, nowDate.toISOString());
    eventStore.add(event);
    await transactionDone(transaction, db);
    return { event, isNew: true };
  },

  async reconcile(options, { now = new Date() } = {}) {
    const scope = validateDataScope(options ?? {});
    const nowIso = now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString();
    const db = await openLocalDatabase();
    const transaction = db.transaction([PROGRESSION_EVENT_STORE_NAME, "catches", "trips"], "readwrite");
    const eventStore = transaction.objectStore(PROGRESSION_EVENT_STORE_NAME);
    const [storedEvents, catches, trips] = await Promise.all([
      requestValue(eventStore.index("scopeKey").getAll(scope.scopeKey)),
      requestValue(transaction.objectStore("catches").index("scopeKey").getAll(scope.scopeKey)),
      requestValue(transaction.objectStore("trips").index("scopeKey").getAll(scope.scopeKey)),
    ]);
    const events = [...storedEvents];
    const existingIds = new Set(events.map((event) => event.id));
    const newEvents = [];
    const add = (definition) => {
      const id = eventId(scope.scopeKey, definition.reasonKey);
      if (existingIds.has(id)) return events.find((event) => event.id === id);
      const event = makeEvent(scope, definition, nowIso);
      eventStore.add(event);
      existingIds.add(id);
      events.push(event);
      newEvents.push(event);
      return event;
    };
    const allOrderedCatches = [...catches].sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt));
    const legacyPhotoHashes = new Set();
    for (const record of allOrderedCatches.filter((item) => !item.verification)) {
      for (const photo of record.photos ?? []) {
        const photoHash = getCatchPhotoHash(photo);
        if (!photoHash || legacyPhotoHashes.has(photoHash)) continue;
        legacyPhotoHashes.add(photoHash);
        add({
          reasonKey: `verification.photo.claimed:${photoHash}`, type: "verification.photo.claimed", xp: 0,
          sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt,
        });
      }
    }
    const progressionCandidates = filterEligibleCatchRecords(catches);
    const progressionCatches = progressionCandidates.filter((record) => {
      if (!record.verification) return true;
      const photoHash = record.verification.photoHash.toLowerCase();
      const claimReason = `verification.photo.claimed:${photoHash}`;
      const existingClaim = events.find((event) => event.reasonKey === claimReason);
      if (existingClaim) return existingClaim.sourceEntityId === record.id;
      if ((record.photos ?? []).some((photo) => getCatchPhotoHash(photo) === photoHash && photo.localError)) return false;
      const claim = add({
        reasonKey: claimReason, type: "verification.photo.claimed", xp: 0,
        sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt,
      });
      return claim?.sourceEntityId === record.id;
    });
    const orderedCatches = progressionCatches.sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt));
    for (const record of orderedCatches) {
      add({ reasonKey: `catch.created:${record.id}`, type: "catch.created", xp: XP_RULES.catch.base, sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt });
      const catchXp = () => events.filter((event) => event.sourceEntityType === "catch" && event.sourceEntityId === record.id && event.type.startsWith("catch."))
        .reduce((total, event) => total + event.xp, 0);
      if ((record.photos ?? []).length > 0) add({ reasonKey: `catch.photo:${record.id}`, type: "catch.photo", xp: Math.max(0, XP_RULES.catch.photo - catchXp()), sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt });
      if (hasContext(record)) add({ reasonKey: `catch.context:${record.id}`, type: "catch.context", xp: Math.max(0, XP_RULES.catch.gpsAndWeather - catchXp()), sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt });
    }
    const firstBySpecies = new Map();
    for (const record of orderedCatches) {
      const speciesKey = record.speciesKey || normalizeText(record.species ?? "");
      if (speciesKey && !firstBySpecies.has(speciesKey)) firstBySpecies.set(speciesKey, record);
    }
    for (const [speciesKey, record] of firstBySpecies) add({ reasonKey: `species.first:${speciesKey}`, type: "species.first", xp: XP_RULES.newSpecies, sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt });
    for (const record of orderedCatches) {
      if (getCatchRarity(record, DEFAULT_SPECIES).key === "legendary") add({
        reasonKey: `rarity.legendary:${record.id}`, type: "rarity.legendary", xp: XP_RULES.legendaryRarity,
        sourceEntityType: "catch", sourceEntityId: record.id, occurredAt: record.caughtAt,
      });
    }

    const streakFreezes = events.filter((event) => event.type === "streak.freeze.used");
    const live = calculateProgression(orderedCatches, trips, { now, streakFreezes });
    for (const achievement of live.achievements.filter((item) => item.isCompleted)) {
      const source = achievementSource(achievement.id, orderedCatches, trips, nowIso);
      add({
        reasonKey: `achievement.unlocked:${achievement.id}`, type: "achievement.unlocked", xp: achievement.xp,
        sourceEntityType: source.entityType, sourceEntityId: source.entityId, occurredAt: source.occurredAt,
      });
    }
    for (const item of calculateSpeciesMastery(orderedCatches)) {
      const speciesCatches = orderedCatches.filter((record) => (record.speciesKey || normalizeText(record.species ?? "")) === item.speciesKey);
      for (const milestone of MASTERY_LEVELS.filter((entry) => item.catchCount >= entry.catches)) {
        const source = speciesCatches[milestone.catches - 1] ?? speciesCatches.at(-1);
        add({ reasonKey: `mastery.milestone:${item.speciesKey}:${milestone.level}`, type: "mastery.milestone", xp: milestone.level === 1 ? 0 : milestone.xp, sourceEntityType: "catch", sourceEntityId: source.id, occurredAt: source.caughtAt });
      }
    }
    for (const reward of [...listCompletedChallengeRewards(orderedCatches, trips), ...listCompletedSeasonalChallengeRewards(orderedCatches)]) add({
      reasonKey: `challenge.completed:${reward.challengeId}:${reward.periodKey}`, type: "challenge.completed", xp: reward.xp,
      sourceEntityType: reward.sourceEntityType, sourceEntityId: reward.sourceEntityId, periodKey: reward.periodKey,
      occurredAt: eventOccurredAt(reward.sourceEntityType, reward.sourceEntityId, orderedCatches, trips, nowIso),
    });
    const streak = calculateWeeklyStreak(orderedCatches, now, streakFreezes);
    for (const milestone of [4, 12, 52].filter((weeks) => streak.weeks >= weeks)) add({ reasonKey: `streak.milestone:${milestone}`, type: "streak.milestone", xp: 0, sourceEntityType: "system", sourceEntityId: `streak-${milestone}`, occurredAt: streak.lastCatchAt ?? nowIso });
    for (let weeks = 7; weeks <= streak.weeks; weeks += 7) add({ reasonKey: `streak.bonus:${weeks}`, type: "streak.bonus", xp: XP_RULES.streakBonus, sourceEntityType: "system", sourceEntityId: `streak-${weeks}`, occurredAt: streak.lastCatchAt ?? nowIso });
    await transactionDone(transaction, db);
    return { events: events.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), newEvents };
  },

  async reconcileCatch(_record, options) {
    const result = await this.reconcile(options);
    return result.events;
  },

  summary(events, catches = [], trips = [], options) { return buildLedgerProgressionSummary(events, catches, trips, options); },
};

export function buildCatchRewardFromLedger(events, catchId, summary, eventIds = null) {
  const selectedIds = eventIds ? new Set(eventIds) : null;
  const earned = events.filter((event) => event.sourceEntityType === "catch" && event.sourceEntityId === catchId
    && (!selectedIds || selectedIds.has(event.id)));
  const xp = earned.reduce((total, event) => total + event.xp, 0);
  const after = summaryForXp(summary.xp);
  const before = summaryForXp(Math.max(0, summary.xp - xp));
  const breakdown = {};
  for (const event of earned) {
    const key = breakdownKey(event);
    breakdown[key] = (breakdown[key] ?? 0) + event.xp;
  }
  const achievementIds = earned.filter((event) => event.type === "achievement.unlocked")
    .map((event) => event.reasonKey.slice("achievement.unlocked:".length));
  return {
    xp, events: earned, breakdown, levelBefore: before.level, levelAfter: after.level,
    rank: after.rank, levelUp: after.level > before.level,
    newlyUnlocked: ACHIEVEMENTS.filter((item) => achievementIds.includes(item.id)),
    newSpecies: earned.some((event) => event.type === "species.first"), progressionAfter: after,
  };
}

export function getCatchRewardEventIds(events, catchId) {
  return events
    .filter((event) => event.sourceEntityType === "catch" && event.sourceEntityId === catchId && event.type !== "verification.photo.claimed")
    .map((event) => event.id);
}

export function claimCatchRewardEventIds(catchId, eventIds, storage = globalThis.sessionStorage) {
  if (!catchId || !Array.isArray(eventIds) || eventIds.length === 0) return [];
  const storageKey = `chytnu:shown-reward:${catchId}`;
  let alreadyShown = [];
  try {
    alreadyShown = JSON.parse(storage?.getItem(storageKey) || "[]");
    if (!Array.isArray(alreadyShown)) alreadyShown = [];
  } catch {
    // Continue with the in-memory claim when session storage is unavailable.
  }
  for (const eventId of alreadyShown) claimedRewardEventIds.add(eventId);
  const newIds = [...new Set(eventIds)].filter((eventId) => !claimedRewardEventIds.has(eventId));
  for (const eventId of newIds) claimedRewardEventIds.add(eventId);
  try {
    storage?.setItem(storageKey, JSON.stringify([...new Set([...alreadyShown, ...eventIds])]));
  } catch {
    // The in-memory claim still prevents replay during this app session.
  }
  return newIds;
}
