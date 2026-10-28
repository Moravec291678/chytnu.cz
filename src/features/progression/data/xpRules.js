export { XP_RULES } from "../../../product/config/xp.js";
import { XP_RULES } from "../../../product/config/xp.js";

/** Round adjusted Catch XP to a deterministic whole XP value. */
export function applyCatchVerificationMultiplier(baseXp, level) {
  const xp = Number(baseXp);
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  const multiplier = XP_RULES.catchVerificationMultiplier[level] ?? 0;
  return Math.round(xp * multiplier);
}

function pragueDayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

/** Pure daily reward policy so the same calculation can later run server-side. */
export function calculateLimitedCatchXpForDay(baseXp, events, now) {
  const today = pragueDayKey(now);
  if (!today) return 0;
  const alreadyAwarded = (Array.isArray(events) ? events : [])
    .filter((event) => event.type === "catch.limited" && pragueDayKey(event.createdAt) === today)
    .reduce((total, event) => total + Math.max(0, Number(event.xp) || 0), 0);
  const remaining = Math.max(0, XP_RULES.limitedCatch.dailyCap - alreadyAwarded);
  return Math.min(applyCatchVerificationMultiplier(baseXp, "limited"), remaining);
}
