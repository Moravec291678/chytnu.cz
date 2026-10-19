import { isMeasuredCatchWeight } from "../../catches/data/catchWeight.js";
import { getBiggestCatch } from "../../home/utils/profileStats.js";
import { calculateProgression } from "./progression.js";

function difference(current, previous) {
  return Math.max(0, current - previous);
}

export function buildCatchReward(record, previousCatches, trips = [], now = new Date()) {
  const before = calculateProgression(previousCatches, trips, { now });
  const after = calculateProgression([...previousCatches, record], trips, { now });
  const previousSpeciesRecord = getBiggestCatch(previousCatches.filter((item) => item.speciesKey === record.speciesKey));
  const previousPersonalRecord = getBiggestCatch(previousCatches);
  const achievementIds = new Set(before.achievements.filter((item) => item.isCompleted).map((item) => item.id));
  const newlyUnlocked = after.achievements
    .filter((item) => item.isCompleted && !achievementIds.has(item.id))
    .map(({ id, name, description, xp }) => ({ id, name, description, xp }));
  const breakdown = Object.fromEntries(Object.keys(after.xpBreakdown).map((key) => [
    key,
    difference(after.xpBreakdown[key], before.xpBreakdown[key] ?? 0),
  ]));
  return {
    xp: difference(after.xp, before.xp),
    breakdown,
    levelBefore: before.level,
    levelAfter: after.level,
    rank: after.rank,
    levelUp: after.level > before.level,
    newlyUnlocked,
    newSpecies: !previousCatches.some((item) => item.speciesKey === record.speciesKey),
    speciesRecord: isMeasuredCatchWeight(record) && (!previousSpeciesRecord || record.weightKg > previousSpeciesRecord.weightKg),
    personalRecord: isMeasuredCatchWeight(record) && (!previousPersonalRecord || record.weightKg > previousPersonalRecord.weightKg),
    progressionAfter: {
      xp: after.xp,
      level: after.level,
      rank: after.rank,
      currentThreshold: after.currentThreshold,
      nextThreshold: after.nextThreshold,
      progressPercent: after.progressPercent,
    },
  };
}

