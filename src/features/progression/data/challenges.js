import { XP_RULES } from "./xpRules.js";
import { filterEligibleCatchRecords } from "../../catches/data/catchVerification.js";
import { CHALLENGE_TIME_ZONE, DAILY_CHALLENGES, WATER_VISIT_GAP_DAYS, WEEKLY_CHALLENGES } from "../../../product/config/challenges.js";
export { DAILY_CHALLENGES, WEEKLY_CHALLENGES } from "../../../product/config/challenges.js";

const WATER_VISIT_GAP_MS = WATER_VISIT_GAP_DAYS * 24 * 60 * 60 * 1000;
const DAILY_CHALLENGE_BY_ID = new Map(DAILY_CHALLENGES.map((item) => [item.id, item]));
const WEEKLY_CHALLENGE_BY_ID = new Map(WEEKLY_CHALLENGES.map((item) => [item.id, item]));
const challengeXp = (challenge) => XP_RULES[challenge.xpKey];

function localDayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CHALLENGE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
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
  const progressByRule = { "catch-count": todayCatches.length, "species-count": speciesToday, "trip-count": completedTripsToday };
  return DAILY_CHALLENGES.map((item) => ({
    id: item.id, periodKey: today, title: item.title,
    progress: Math.min(progressByRule[item.ruleKey] ?? 0, item.goal), goal: item.goal, xp: challengeXp(item),
  }));
}

export function calculateQuestXp(catches, trips = [], now = new Date()) {
  const rewards = listCompletedChallengeRewards(catches, trips, now);
  const sum = (id) => rewards.filter((reward) => reward.challengeId === id).reduce((total, reward) => total + reward.xp, 0);
  const dailyCatchXp = sum(DAILY_CHALLENGES[0].id);
  const dailySpeciesXp = sum(DAILY_CHALLENGES[1].id);
  const dailyTripXp = sum(DAILY_CHALLENGES[2].id);
  const weeklySpeciesXp = sum(WEEKLY_CHALLENGES[0].id);
  const weeklyWaterXp = sum(WEEKLY_CHALLENGES[1].id);
  return {
    dailyCatchXp, dailySpeciesXp, dailyTripXp, weeklySpeciesXp, weeklyWaterXp,
    total: dailyCatchXp + dailySpeciesXp + dailyTripXp + weeklySpeciesXp + weeklyWaterXp,
  };
}

export function listCompletedChallengeRewards(catches, trips = [], now = new Date()) {
  catches = filterEligibleCatchRecords(catches, { now });
  const dailyCatchCountByDay = new Map();
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
    dailyCatchCountByDay.set(day, (dailyCatchCountByDay.get(day) ?? 0) + 1);
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
        const visits = waterVisitsByWeek.get(week) ?? [];
        if (!visits.some((visit) => visit.waterId === record.waterId)) visits.push(record);
        waterVisitsByWeek.set(week, visits);
      }
      latestWaterVisit.set(record.waterId, timestamp);
    }
  }

  const tripsByDay = new Map();
  for (const trip of trips.filter((item) => item.endedAt).sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt))) {
    const day = localDayKey(trip.endedAt);
    if (day) {
      const tripsForDay = tripsByDay.get(day) ?? [];
      tripsForDay.push(trip);
      tripsByDay.set(day, tripsForDay);
    }
  }
  const rewards = [];
  const dailyCatch = DAILY_CHALLENGE_BY_ID.get("daily-catch");
  const dailySpecies = DAILY_CHALLENGE_BY_ID.get("daily-species");
  const dailyTrip = DAILY_CHALLENGE_BY_ID.get("daily-trip");
  const weeklySpecies = WEEKLY_CHALLENGE_BY_ID.get("weekly-species");
  const weeklyWater = WEEKLY_CHALLENGE_BY_ID.get("weekly-water");
  for (const [day, catchCount] of dailyCatchCountByDay) if (catchCount >= dailyCatch.goal) rewards.push({ challengeId: dailyCatch.id, periodKey: day, xp: challengeXp(dailyCatch), sourceEntityType: "catch", sourceEntityId: firstCatchByDay.get(day)?.id ?? day });
  for (const [day, species] of speciesByDay) if (species.size >= dailySpecies.goal) rewards.push({ challengeId: dailySpecies.id, periodKey: day, xp: challengeXp(dailySpecies), sourceEntityType: "catch", sourceEntityId: speciesCompletionByDay.get(day)?.id ?? day });
  for (const [day, dayTrips] of tripsByDay) if (dayTrips.length >= dailyTrip.goal) rewards.push({ challengeId: dailyTrip.id, periodKey: day, xp: challengeXp(dailyTrip), sourceEntityType: "trip", sourceEntityId: dayTrips[dailyTrip.goal - 1].id });
  for (const [week, species] of speciesByWeek) if (species.size >= weeklySpecies.goal) rewards.push({ challengeId: weeklySpecies.id, periodKey: week, xp: challengeXp(weeklySpecies), sourceEntityType: "catch", sourceEntityId: speciesCompletionByWeek.get(week)?.id ?? week });
  for (const [week, visits] of waterVisitsByWeek) if (visits.length >= weeklyWater.goal) rewards.push({ challengeId: weeklyWater.id, periodKey: week, xp: challengeXp(weeklyWater), sourceEntityType: "catch", sourceEntityId: visits[weeklyWater.goal - 1].id });
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
  const progressByRule = { "species-count": uniqueSpecies(weekRecords).size, "water-visit": waterVisitProgress.size };
  return WEEKLY_CHALLENGES.map((item) => ({
    id: item.id, periodKey: thisWeek, title: item.title,
    progress: Math.min(progressByRule[item.ruleKey] ?? 0, item.goal), goal: item.goal, xp: challengeXp(item),
  }));
}

export function buildChallengeOverview(catches, trips = [], now = new Date()) {
  catches = filterEligibleCatchRecords(catches, { now });
  const daily = dailyTasks(catches, trips, now);
  const weekly = weeklyTasks(catches, now);
  const decorate = (tasks) => tasks.map((task) => ({
    ...task,
    completed: task.progress >= task.goal,
    progressLabel: `${task.progress}/${task.goal}`,
  }));
  return { daily: decorate(daily), weekly: decorate(weekly) };
}
