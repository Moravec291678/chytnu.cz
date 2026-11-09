import { MAX_LEVEL, getRankForLevel, xpForLevel } from "./progression.js";

export function summaryForXp(xp) {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level += 1;
  const currentThreshold = xpForLevel(level);
  const nextThreshold = level === MAX_LEVEL ? null : xpForLevel(level + 1);
  return { xp, level, rank: getRankForLevel(level), currentThreshold, nextThreshold,
    progressPercent: nextThreshold === null ? 100 : Math.round(((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100) };
}

export function applyProgressionAdjustment(summary, adjustmentXp = 0) {
  const delta = Number.isSafeInteger(adjustmentXp) ? adjustmentXp : 0;
  return { ...summary, ...summaryForXp(Math.max(0, summary.xp + delta)), adminAdjustmentXp: delta,
    xpBreakdown: { ...summary.xpBreakdown, adminAdjustmentXp: delta } };
}
