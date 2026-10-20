import { XP_RULES } from "./xpRules.js";

const PRAGUE_TIME_ZONE = "Europe/Prague";
const WATER_VISIT_GAP_MS = 30 * 24 * 60 * 60 * 1000;

function localDayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: PRAGUE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function localWeekStart(value) {
  const dayKey = localDayKey(value);
  if (!dayKey) return null;
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function currentPeriodRecords(records, predicate) {
  return records.filter((record) => {
    const timestamp = Date.parse(record.caughtAt);
    return Number.isFinite(timestamp) && predicate(timestamp);
  });
}

function uniqueSpecies(records) {
  return new Set(records.map((record) => record.speciesKey).filter((speciesKey) => typeof speciesKey === "string" && speciesKey.trim()));
}

function dailyTasks(catches, trips, now) {
  const today = localDayKey(now);
  const todayCatches = catches.filter((item) => localDayKey(item.caughtAt) === today);
  const speciesToday = uniqueSpecies(todayCatches).size;
  const completedTripsToday = trips.filter((trip) => trip.endedAt && localDayKey(trip.endedAt) === today).length;
  return [
    { id: "daily-catch", periodKey: today, title: "Zaznamenej dnešní úlovek", progress: Math.min(todayCatches.length, 1), goal: 1, xp: XP_RULES.dailyChallenge },
    { id: "daily-species", periodKey: today, title: "Zaznamenej dnes dva různé druhy", progress: Math.min(speciesToday, 2), goal: 2, xp: XP_RULES.dailyChallenge },
    { id: "daily-trip", periodKey: today, title: "Dokonči dnešní výpravu", progress: Math.min(completedTripsToday, 1), goal: 1, xp: XP_RULES.dailyChallenge },
  ];
}

export function calculateQuestXp(catches, trips = []) {
  const rewards = listCompletedChallengeRewards(catches, trips);
  const sum = (id) => rewards.filter((reward) => reward.challengeId === id).reduce((total, reward) => total + reward.xp, 0);
  const dailyCatchXp = sum("daily-catch");
  const dailySpeciesXp = sum("daily-species");
  const dailyTripXp = sum("daily-trip");
  const weeklySpeciesXp = sum("weekly-species");
  const weeklyWaterXp = sum("weekly-water");
  return {
    dailyCatchXp, dailySpeciesXp, dailyTripXp, weeklySpeciesXp, weeklyWaterXp,
    total: dailyCatchXp + dailySpeciesXp + dailyTripXp + weeklySpeciesXp + weeklyWaterXp,
  };
}

export function listCompletedChallengeRewards(catches, trips = []) {
  const dailyCatchDays = new Set();
  const speciesByDay = new Map();
  const waterVisitsByWeek = new Map();
  const speciesByWeek = new Map();
  const firstCatchByDay = new Map();
  const speciesCompletionByDay = new Map();
  const speciesCompletionByWeek = new Map();

  const orderedCatches = [...catches].sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt));
  const latestWaterVisit = new Map();
  for (const record of orderedCatches) {
    const timestamp = Date.parse(record.caughtAt);
    if (!Number.isFinite(timestamp)) continue;
    const day = localDayKey(timestamp);
    const week = localWeekStart(timestamp);
    dailyCatchDays.add(day);
    if (!firstCatchByDay.has(day) || timestamp < Date.parse(firstCatchByDay.get(day).caughtAt)) firstCatchByDay.set(day, record);

    const speciesKey = typeof record.speciesKey === "string" ? record.speciesKey.trim() : "";
    if (speciesKey) {
      const daySpecies = speciesByDay.get(day) ?? new Set();
      daySpecies.add(speciesKey);
      speciesByDay.set(day, daySpecies);
      if (daySpecies.size >= 2 && !speciesCompletionByDay.has(day)) speciesCompletionByDay.set(day, record);
      const weekSpecies = speciesByWeek.get(week) ?? new Set();
      weekSpecies.add(speciesKey);
      speciesByWeek.set(week, weekSpecies);
      if (weekSpecies.size >= 3 && !speciesCompletionByWeek.has(week)) speciesCompletionByWeek.set(week, record);
    }

    if (record.waterId) {
      const previousVisit = latestWaterVisit.get(record.waterId);
      if (!previousVisit || timestamp - previousVisit >= WATER_VISIT_GAP_MS) {
        if (!waterVisitsByWeek.has(week)) waterVisitsByWeek.set(week, record);
      }
      latestWaterVisit.set(record.waterId, timestamp);
    }
  }

  const firstTripByDay = new Map();
  for (const trip of trips.filter((item) => item.endedAt).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt))) {
    const day = localDayKey(trip.endedAt);
    if (day && !firstTripByDay.has(day)) firstTripByDay.set(day, trip);
  }
  const rewards = [];
  for (const day of dailyCatchDays) rewards.push({ challengeId: "daily-catch", periodKey: day, xp: XP_RULES.dailyChallenge, sourceEntityType: "catch", sourceEntityId: firstCatchByDay.get(day)?.id ?? day });
  for (const [day, species] of speciesByDay) if (species.size >= 2) rewards.push({ challengeId: "daily-species", periodKey: day, xp: XP_RULES.dailyChallenge, sourceEntityType: "catch", sourceEntityId: speciesCompletionByDay.get(day)?.id ?? day });
  for (const [day, trip] of firstTripByDay) rewards.push({ challengeId: "daily-trip", periodKey: day, xp: XP_RULES.dailyChallenge, sourceEntityType: "trip", sourceEntityId: trip.id });
  for (const [week, species] of speciesByWeek) if (species.size >= 3) rewards.push({ challengeId: "weekly-species", periodKey: week, xp: XP_RULES.weeklyChallenge, sourceEntityType: "catch", sourceEntityId: speciesCompletionByWeek.get(week)?.id ?? week });
  for (const [week, source] of waterVisitsByWeek) rewards.push({ challengeId: "weekly-water", periodKey: week, xp: XP_RULES.weeklyChallenge, sourceEntityType: "catch", sourceEntityId: source.id });
  return rewards;
}

function weeklyTasks(catches, now) {
  const thisWeek = localWeekStart(now);
  const weekRecords = currentPeriodRecords(catches, (timestamp) => localWeekStart(timestamp) === thisWeek);
  const latestVisits = new Map();
  for (const record of catches) {
    const timestamp = Date.parse(record.caughtAt);
    if (record.waterId && Number.isFinite(timestamp) && localWeekStart(record.caughtAt) < thisWeek) {
      latestVisits.set(record.waterId, Math.max(latestVisits.get(record.waterId) ?? -Infinity, timestamp));
    }
  }
  const waterVisitProgress = new Set();
  for (const record of [...weekRecords].sort((a, b) => Date.parse(a.caughtAt) - Date.parse(b.caughtAt))) {
    if (!record.waterId || waterVisitProgress.has(record.waterId)) continue;
    const timestamp = Date.parse(record.caughtAt);
    const previous = latestVisits.get(record.waterId);
    if (previous === undefined || timestamp - previous >= WATER_VISIT_GAP_MS) waterVisitProgress.add(record.waterId);
  }
  return [
    { id: "weekly-species", periodKey: thisWeek, title: "Zaznamenej tři druhy tento týden", progress: Math.min(uniqueSpecies(weekRecords).size, 3), goal: 3, xp: XP_RULES.weeklyChallenge },
    { id: "weekly-water", periodKey: thisWeek, title: "Navštiv revír po 30 a více dnech", progress: Math.min(waterVisitProgress.size, 1), goal: 1, xp: XP_RULES.weeklyChallenge },
  ];
}

export function buildChallengeOverview(catches, trips = [], now = new Date()) {
  const daily = dailyTasks(catches, trips, now);
  const weekly = weeklyTasks(catches, now);
  const decorate = (tasks) => tasks.map((task) => ({
    ...task,
    completed: task.progress >= task.goal,
    progressLabel: `${task.progress}/${task.goal}`,
  }));
  return { daily: decorate(daily), weekly: decorate(weekly) };
}
