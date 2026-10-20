const PRAGUE_TIME_ZONE = "Europe/Prague";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function pragueParts(value) {
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
}

export function getPragueStreakWeekKey(value) {
  const parts = pragueParts(value);
  if (!parts) return null;
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, "0")}-${String(day.getUTCDate()).padStart(2, "0")}`;
}

export function getPragueStreakMonthKey(value) {
  const parts = pragueParts(value);
  return parts ? `${parts.year}-${parts.month}` : null;
}

function weekKeyToUtc(key) {
  const timestamp = Date.parse(`${key}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getStreakWeekHistory(catches, freezeEvents = [], now = new Date(), count = 7) {
  const currentKey = getPragueStreakWeekKey(now);
  const currentStart = weekKeyToUtc(currentKey);
  if (currentStart === null) return [];
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(now);
  const caughtWeeks = new Set(catches
    .filter((item) => Number.isFinite(Date.parse(item.caughtAt)) && Date.parse(item.caughtAt) <= nowTimestamp)
    .map((item) => getPragueStreakWeekKey(item.caughtAt))
    .filter(Boolean));
  const frozenWeeks = new Set(freezeEvents
    .filter((event) => event.type === "streak.freeze.used")
    .map((event) => event.periodKey)
    .filter(Boolean));
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(currentStart - (count - index - 1) * 7 * 24 * 60 * 60 * 1000);
    const weekKey = start.toISOString().slice(0, 10);
    const status = caughtWeeks.has(weekKey) ? "catch" : frozenWeeks.has(weekKey) ? "freeze" : "empty";
    return { weekKey, status };
  });
}

export function canUseStreakFreeze(catches, events = [], now = new Date()) {
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(now);
  const weekKey = getPragueStreakWeekKey(nowTimestamp);
  const monthKey = getPragueStreakMonthKey(nowTimestamp);
  if (!weekKey || !monthKey) return false;
  if (events.some((event) => event.type === "streak.freeze.used"
    && event.reasonKey === `streak.freeze.used:${monthKey}`)) return false;
  if (events.some((event) => event.type === "streak.freeze.used" && event.periodKey === weekKey)) return false;
  if (catches.some((item) => Number.isFinite(Date.parse(item.caughtAt))
    && Date.parse(item.caughtAt) <= nowTimestamp
    && getPragueStreakWeekKey(item.caughtAt) === weekKey)) return false;
  const streak = calculateWeeklyStreak(catches, now, events);
  return streak.isActive && streak.weeks > 0;
}

export function calculateWeeklyStreak(catches, now = new Date(), freezeEvents = []) {
  const nowTimestamp = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowTimestamp)) throw new TypeError("Datum výpočtu série musí být platné.");
  const currentWeek = getPragueStreakWeekKey(nowTimestamp);
  const lastCatchTimestamp = catches
    .map((item) => Date.parse(item.caughtAt))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= nowTimestamp)
    .sort((left, right) => right - left)[0] ?? null;
  const lastCatchAt = lastCatchTimestamp === null ? null : new Date(lastCatchTimestamp).toISOString();
  if (lastCatchTimestamp === null) return { weeks: 0, isActive: false, lastCatchAt: null };

  const activeWeeks = new Set(catches
    .map((item) => ({ timestamp: Date.parse(item.caughtAt), week: getPragueStreakWeekKey(item.caughtAt) }))
    .filter((item) => Number.isFinite(item.timestamp) && item.timestamp <= nowTimestamp && item.week)
    .map((item) => item.week));
  for (const event of freezeEvents) {
    if (event.type === "streak.freeze.used" && event.periodKey && event.periodKey <= currentWeek) activeWeeks.add(event.periodKey);
  }

  const currentWeekHasActivity = activeWeeks.has(currentWeek);
  const withinSevenDays = nowTimestamp - lastCatchTimestamp <= SEVEN_DAYS_MS;
  const isActive = currentWeekHasActivity || withinSevenDays;
  if (!isActive) return { weeks: 0, isActive: false, lastCatchAt };

  const latestWeek = currentWeekHasActivity ? currentWeek : getPragueStreakWeekKey(lastCatchTimestamp);
  let cursor = weekKeyToUtc(latestWeek);
  let weeks = 0;
  while (cursor !== null && activeWeeks.has(new Date(cursor).toISOString().slice(0, 10))) {
    weeks += 1;
    cursor -= 7 * 24 * 60 * 60 * 1000;
  }
  return { weeks, isActive, lastCatchAt };
}
