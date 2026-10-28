import { buildChallengeOverview } from "../../features/progression/data/challenges.js";
import { buildSeasonalChallenge } from "../../features/progression/data/seasonalChallenge.js";
import { CATCH_VERIFICATION_LEVEL } from "../../features/catches/data/catchVerification.js";

const VALID_LEVELS = new Set(Object.values(CATCH_VERIFICATION_LEVEL));

function addDuplicateIdIssues(items, collection, issues) {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) {
      issues.push({ code: "missing-id", collection, recordId: null, field: "id" });
    } else if (seen.has(item.id)) {
      issues.push({ code: "duplicate-id", collection, recordId: item.id, field: "id" });
    } else seen.add(item.id);
  }
}

function validDate(value) {
  return typeof value === "string" || value instanceof Date
    ? Number.isFinite(Date.parse(value))
    : false;
}

function addDateIssue(issues, collection, item, field, optional = false) {
  if (optional && (item[field] === null || item[field] === undefined || item[field] === "")) return;
  if (!validDate(item[field])) issues.push({ code: "invalid-date", collection, recordId: item.id ?? null, field });
}

function addCoordinateIssue(issues, collection, item, value, field) {
  if (value === null || value === undefined) return;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    issues.push({ code: "invalid-coordinates", collection, recordId: item.id ?? null, field });
  }
}

function validateChallenges(challenges, issues) {
  const ids = new Set();
  for (const challenge of challenges) {
    if (!challenge || typeof challenge.id !== "string" || !challenge.id.trim()) {
      issues.push({ code: "invalid-challenge-config", collection: "challenges", recordId: null, field: "id" });
      continue;
    }
    if (ids.has(challenge.id)) issues.push({ code: "duplicate-id", collection: "challenges", recordId: challenge.id, field: "id" });
    ids.add(challenge.id);
    if (typeof challenge.title !== "string" || !challenge.title.trim()
      || !Number.isFinite(challenge.goal) || challenge.goal <= 0
      || !Number.isFinite(challenge.xp) || challenge.xp < 0
      || !Number.isFinite(challenge.progress) || challenge.progress < 0) {
      issues.push({ code: "invalid-challenge-config", collection: "challenges", recordId: challenge.id, field: "config" });
    }
  }
}

/** Read-only integrity diagnostics. Never normalizes or writes user records. */
export function validateProductDataIntegrity({ catches = [], trips = [], waters = [], rewardEvents = [], challenges = [] } = {}) {
  const issues = [];
  addDuplicateIdIssues(catches, "catches", issues);
  addDuplicateIdIssues(trips, "trips", issues);
  addDuplicateIdIssues(waters, "waters", issues);
  addDuplicateIdIssues(rewardEvents, "progression-rewards", issues);

  const tripIds = new Set(trips.map((trip) => trip?.id).filter(Boolean));
  const waterIds = new Set(waters.map((water) => water?.id).filter(Boolean));
  for (const record of catches) {
    if (record?.tripId && !tripIds.has(record.tripId)) issues.push({ code: "missing-reference", collection: "catches", recordId: record.id ?? null, field: "tripId" });
    if (record?.waterId && !waterIds.has(record.waterId)) issues.push({ code: "missing-reference", collection: "catches", recordId: record.id ?? null, field: "waterId" });
    addDateIssue(issues, "catches", record, "caughtAt");
    addCoordinateIssue(issues, "catches", record, record?.coordinates, "coordinates");
    const level = record?.verification?.level;
    if (level !== undefined && !VALID_LEVELS.has(level)) issues.push({ code: "invalid-verification-level", collection: "catches", recordId: record.id ?? null, field: "verification.level" });
  }
  for (const trip of trips) {
    addDateIssue(issues, "trips", trip, "startedAt");
    addDateIssue(issues, "trips", trip, "endedAt", true);
    if (trip?.endedAt && validDate(trip.startedAt) && validDate(trip.endedAt) && Date.parse(trip.endedAt) < Date.parse(trip.startedAt)) {
      issues.push({ code: "invalid-date-order", collection: "trips", recordId: trip.id ?? null, field: "endedAt" });
    }
  }
  for (const water of waters) addCoordinateIssue(issues, "waters", water, water?.coordinates, "coordinates");
  for (const event of rewardEvents) {
    addDateIssue(issues, "progression-rewards", event, "occurredAt");
    addDateIssue(issues, "progression-rewards", event, "createdAt");
  }
  validateChallenges(challenges, issues);
  return issues;
}

export function auditProductDataIntegrity({ catches, trips, waters, rewardEvents, now = new Date() }) {
  const overview = buildChallengeOverview(catches, trips, now);
  const seasonal = buildSeasonalChallenge(catches, now);
  return validateProductDataIntegrity({
    catches,
    trips,
    waters,
    rewardEvents,
    challenges: [...overview.daily, ...overview.weekly, ...seasonal.variants],
  });
}
