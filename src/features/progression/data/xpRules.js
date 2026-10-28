export const XP_RULES = Object.freeze({
  catch: Object.freeze({ base: 10, photo: 15, gpsAndWeather: 20 }),
  catchVerificationMultiplier: Object.freeze({ strong: 1, standard: 1, limited: 0.25, unverified: 0 }),
  limitedCatch: Object.freeze({ dailyCap: 20 }),
  newSpecies: 50,
  newWater: 30,
  dailyChallenge: 25,
  weeklyChallenge: 75,
  streakBonus: 50,
  achievement: Object.freeze({ min: 30, max: 200 }),
  communityContribution: 5,
  publicShare: 10,
  legendaryRarity: 200,
});

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
